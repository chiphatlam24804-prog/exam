
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/* ── 讀取答案卡 ─────────────────────────────────────────────
   優先順序：
     1. 環境變數 ANSWER_KEY（純 JSON 或 Base64 編碼的 JSON）—— 答案完全不進 repository
     2. 專案根目錄的 answers.json —— 在 public/ 之外，網站讀不到
   兩種都不會送到學生的瀏覽器。                                */
let _book = null;
function book(){
  if(_book) return _book;
  const env = process.env.ANSWER_KEY;
  if(env && env.trim()){
    const raw = env.trim().startsWith('{') ? env : Buffer.from(env, 'base64').toString('utf8');
    _book = JSON.parse(raw);
  }else{
    let txt = null;
    for(const p of [path.join(process.cwd(),'answers.json'), path.join(__dirname,'..','answers.json')]){
      try{ txt = fs.readFileSync(p,'utf8'); break; }catch(e){}
    }
    if(!txt) try{ _book = require('../answers.json'); }catch(e){}
    if(txt) _book = JSON.parse(txt);
  }
  if(!_book) throw new Error('找不到答案卡：請設定環境變數 ANSWER_KEY，或把 answers.json 放在專案根目錄');
  _book.keys = _book.keys || {};
  _book.low  = new Set(_book.low || []);
  return _book;
}

/* ── 考試 token（HMAC 簽章，防止有人直接呼叫評分 API 撈答案）── */
function secret(){
  return process.env.SESSION_SECRET
      || process.env.VERCEL_URL          // 沒設也還能跑，但重新部署後舊 token 會失效
      || 'insecure-development-secret';
}
const b64u = b => Buffer.from(b).toString('base64url');
function sign(payload){
  const body = b64u(JSON.stringify(payload));
  const mac  = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return body + '.' + mac;
}
function verify(token){
  if(typeof token !== 'string' || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  const want = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  const a = Buffer.from(mac||''), b = Buffer.from(want);
  if(a.length !== b.length || !crypto.timingSafeEqual(a,b)) return null;
  try{ return JSON.parse(Buffer.from(body,'base64url').toString('utf8')); }catch(e){ return null; }
}

/* ── 評分引擎（只跑在伺服器上）───────────────────────────── */
function deaccent(s){return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D');}
function toks(s,lang){
  s=String(s||'').toLowerCase();
  if(lang==='vi') return deaccent(s).replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(Boolean);
  return [...s.replace(/[\s\u3000]/g,'').replace(/[，。！？；：、．,.!?;:“”"'（）()《》…—-]/g,'')];
}
function grams(a){if(a.length<2)return a.slice();const r=[];for(let i=0;i<a.length-1;i++)r.push(a[i]+'\u0001'+a[i+1]);return r;}
function dice(A,B){
  if(!A.length||!B.length)return 0;
  const m=new Map(); A.forEach(x=>m.set(x,(m.get(x)||0)+1));
  let hit=0; B.forEach(x=>{const c=m.get(x); if(c){hit++;m.set(x,c-1);}});
  return 2*hit/(A.length+B.length);
}
function similarity(a,b,lang){const A=toks(a,lang),B=toks(b,lang);
  return 0.5*dice(A,B)+0.5*dice(grams(A),grams(B));}
function hasTerm(hay,term,lang){
  if(lang==='vi') return deaccent(String(hay).toLowerCase()).includes(deaccent(String(term).toLowerCase()).trim());
  return String(hay).includes(term);
}
function band(r){return r>=0.80?1:r>=0.62?0.75:r>=0.42?0.5:r>=0.25?0.25:0;}

function gradeItem(item, raw, keys){
  const no = item.no, k = keys[String(no)], pts = item.pts;
  const ans = String(raw==null?'':raw).trim();
  const out = {no, pts, score:0, ratio:0, ref:'', verdict:'zero', blank:!ans};
  if(!k){ out.note='本题未设定答案'; return out; }
  if(!ans){ out.ref = k.mode==='choice'?k.a:(k.mode==='exact'?String(k.a).split('/')[0]:(k.ref||'')); return out; }

  if(k.mode==='choice'){
    out.ref=k.a; out.ratio = ans.toUpperCase()===String(k.a).toUpperCase()?1:0;
  }else if(k.mode==='exact'){
    const alts=String(k.a).split('/').map(s=>s.trim()).filter(Boolean);
    out.ref=alts.join(' / ');
    const n=x=>x.replace(/\s/g,'').toLowerCase();
    if(alts.some(a=>n(a)===n(ans))) out.ratio=1;
    else if(k.fuzzy!==false){
      const best=Math.max(...alts.map(a=>similarity(a,ans,'zh')));
      out.sim=best; out.ratio = best>=0.75?1:best>=0.45?0.5:0;
    }
  }else if(k.mode==='order'){
    const cands=[k.ref,...(k.alts||[])]; out.ref=k.ref;
    const n=x=>toks(x,'zh').join('');
    if(cands.some(c=>n(c)===n(ans))) out.ratio=1;
    else{const best=Math.max(...cands.map(c=>similarity(c,ans,'zh'))); out.sim=best;
         out.ratio = best>=0.92?1:best>=0.75?0.5:best>=0.55?0.25:0;}
  }else{
    const lang=k.lang||'zh'; out.ref=k.ref;
    const s=similarity(k.ref,ans,lang); let cov=null;
    if(k.must&&k.must.length){
      const hit=k.must.filter(g=>g.some(t=>hasTerm(ans,t,lang))).length;
      cov=hit/k.must.length; out.cov=cov; out.covHit=hit; out.covAll=k.must.length;
    }
    let r = cov===null ? s : 0.65*cov+0.35*Math.min(1,s*1.35);
    if(k.forbid&&k.forbid.some(t=>hasTerm(ans,t,lang))){ r*=0.35; out.forbidden=true; }
    out.sim=s; out.ratio=band(r);
  }
  out.score = Math.round(out.ratio*pts*10000)/10000;
  out.verdict = out.ratio>=0.999?'full':out.ratio>0?'part':'zero';
  return out;
}

function examItems(){
  const exam = require('../public/data/exam.json');
  const list = [];
  exam.parts.forEach(p=>p.sections.forEach(s=>s.items.forEach(i=>
    list.push({no:i.no, pts:i.pts, partId:p.id}))));
  return {exam, list};
}

function gradeAll(answers){
  const {exam, list} = examItems();
  const bk = book();
  const detail = {}; const per = {}; let total = 0;
  exam.parts.forEach(p=>per[p.id]=0);
  list.forEach(i=>{
    const r = gradeItem(i, answers[i.no] ?? answers[String(i.no)], bk.keys);
    r.low = bk.low.has(String(i.no));
    detail[i.no] = r; total += r.score; per[i.partId] += r.score;
  });
  Object.keys(per).forEach(k=>per[k]=Math.round(per[k]*100)/100);
  return {detail, per, total: Math.round(total*100)/100, max: exam.meta.total};
}

function readBody(req){
  if(req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise((res,rej)=>{
    let s=''; req.on('data',c=>{s+=c; if(s.length>2e6){rej(new Error('payload too large'));req.destroy();}});
    req.on('end',()=>{ try{ res(s?JSON.parse(s):{}); }catch(e){ rej(new Error('invalid JSON')); } });
    req.on('error',rej);
  });
}

module.exports = {book, sign, verify, gradeAll, readBody, examItems};
