
const $ = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>[...r.querySelectorAll(s)];
const esc = s => String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const AUTO_TYPES = ['mc','tf','gridfill','sentencefill','position'];
function allItems(){const r=[];EXAM.parts.forEach(p=>p.sections.forEach(s=>s.items.forEach(i=>r.push({...i,type:s.type,secId:s.id,secTitle:s.title,partId:p.id,partTitle:p.title}))));return r;}
function toast(msg){let t=$('#toast');t.textContent=msg;t.classList.add('on');clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('on'),2600);}
function download(name,obj){
  const blob=new Blob([typeof obj==='string'?obj:JSON.stringify(obj,null,2)],{type:'application/json;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1500);
}
function safeName(s){return String(s||'').replace(/[^\p{L}\p{N}_-]+/gu,'_').slice(0,40)||'unnamed';}
function norm(s){return String(s??'').trim().replace(/\s+/g,'').replace(/[，。！？；：、．,.!?;:]/g,'').toUpperCase();}
function cnCount(s){return (String(s||'').replace(/\s/g,'')).length;}
function fmt(n){return (Math.round(n*100)/100).toFixed(2).replace(/\.00$/,'').replace(/(\.\d)0$/,'$1');}
function passageHtml(txt, cls='blank'){
  return txt.split(/\n\n+/).map(p=>'<p>'+esc(p).replace(/\[\[(\d+)\]\]/g,(m,n)=>`<span class="${cls}">${n}</span>`)+'</p>').join('');
}

/* ══════════════════════════════════════════════════════════════════════
   前端：只負責出題與顯示。
   評分完全在伺服器端 /api/grade 進行，答案卡從來不會送到瀏覽器。
   ══════════════════════════════════════════════════════════════════════ */
var EXAM=null, ITEMS=[], BYNO={}, ANS={}, META={}, TOKEN=null;
var TIMER=null, LEFT=0, DONE=false, TIMED=true, RESULT=null, KEYS=null, LOW=new Set();

async function api(path, body){
  const r = await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},
                             body:JSON.stringify(body||{})});
  let data=null; try{ data=await r.json(); }catch(e){}
  if(!r.ok) throw new Error((data&&data.error)||('HTTP '+r.status));
  return data;
}

/* ═════════ 畫考卷 ═════════ */
function renderExam(){
  const root=$('#paper'); root.innerHTML='';
  EXAM.parts.forEach(part=>{
    const el=document.createElement('section'); el.className='part';
    let h=`<div class="part-head"><h2>${esc(part.title)}</h2><span class="pts">${part.points} 分</span></div>`;
    if(part.guide) h+=`<div class="guide"><b>HƯỚNG DẪN PHẦN NGHE HIỂU</b><ul>${part.guide.map(g=>`<li>${esc(g)}</li>`).join('')}</ul></div>`;
    if(part.audio) h+=`<div class="panel" style="margin:14px 0"><h2>录音 / File nghe</h2>
      <audio id="audioPlayer" controls preload="none" style="width:100%"></audio>
      <div class="meta-s" style="margin-top:8px">若没有声音，请把录音档放进 <code>public/audio/listening.mp3</code>，或在此选择本机档案：</div>
      <input type="file" id="audioFile" accept="audio/*" style="font-size:13px;margin-top:8px"></div>`;
    part.sections.forEach(sec=>{h+=renderSection(sec);});
    el.innerHTML=h; root.appendChild(el);
  });
  bindInputs();
}
function renderSection(sec){
  let h=`<div class="sec" id="${sec.id}"><div class="sec-head"><h3>${esc(sec.title)}</h3><span class="spts">${sec.points} 分</span></div>`;
  if(sec.hint) h+=`<div class="hint">${esc(sec.hint)}</div>`;
  if(sec.passage) h+=`<div class="passage">${passageHtml(sec.passage)}</div>`;
  if(sec.wordbank) h+=`<div class="wordbank">${sec.wordbank.map(w=>`<span>${esc(w)}</span>`).join('')}</div>`;
  if(sec.type==='gridfill'){
    h+=`<div class="hint">填答案空格</div><div class="agrid">`+sec.items.map(i=>
      `<div class="cell"><div class="n">${i.no}</div><input id="in${i.no}" data-q="${i.no}" ${sec.single?'maxlength="1"':''} autocomplete="off"></div>`).join('')+`</div>`;
  }else if(sec.type==='tf'){
    h+=sec.items.map(i=>`<div class="tfrow" id="in${i.no}"><span class="qn">${i.no}</span><div class="txt">${i.text}</div>
      <div class="tfbtns"><button type="button" class="tfb" data-q="${i.no}" data-v="√">√</button>
      <button type="button" class="tfb no" data-q="${i.no}" data-v="×">×</button></div></div>`).join('');
  }else if(sec.type==='mc'){
    h+=sec.items.map(i=>`<div class="q" id="in${i.no}"><div class="qt"><span class="qn">${i.no}</span>${i.text}</div>
      <div class="opts">${i.options.map((o,k)=>{const L='ABCD'[k];
        return `<label class="opt" tabindex="0" role="radio" aria-label="${L}" data-q="${i.no}" data-v="${L}"><span class="k">${L}</span><span>${esc(o)}</span></label>`;}).join('')}</div></div>`).join('');
  }else if(sec.type==='position'){
    h+=sec.items.map(i=>`<div class="q" id="in${i.no}"><div class="qt"><span class="qn">${i.no}</span>${i.text}<span class="wordchip">${esc(i.word)}</span></div>
      <div class="opts">${['A','B','C','D'].map(L=>
        `<label class="opt" tabindex="0" role="radio" aria-label="${L}" data-q="${i.no}" data-v="${L}"><span class="k">${L}</span><span>位置 ${L}</span></label>`).join('')}</div></div>`).join('');
  }else if(sec.type==='sentencefill'){
    h+=sec.items.map(i=>`<div class="q" id="in${i.no}"><div class="qt"><span class="qn">${i.no}</span>`+
      i.text.replace(/＿+/,`<input class="inline-in" data-q="${i.no}" autocomplete="off">`)+`</div></div>`).join('');
  }else{
    h+=sec.items.map(i=>`<div class="q" id="in${i.no}"><div class="qt"><span class="qn">${i.no}</span>${i.text}</div>
      <textarea data-q="${i.no}" rows="${i.rows||3}" placeholder="在此作答……" style="margin-top:9px"></textarea></div>`).join('');
  }
  return h+`</div>`;
}
function bindInputs(){
  $$('#paper input[data-q], #paper textarea[data-q]').forEach(el=>
    el.addEventListener('input',()=>{ANS[el.dataset.q]=el.value;updateProgress();}));
  const pick=el=>{const q=el.dataset.q;ANS[q]=el.dataset.v;
    $$(`.opt[data-q="${q}"]`).forEach(o=>{o.classList.toggle('on',o===el);o.setAttribute('aria-checked',o===el);});updateProgress();};
  $$('.opt').forEach(el=>{el.addEventListener('click',()=>pick(el));
    el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pick(el);}});});
  $$('.tfb').forEach(el=>el.addEventListener('click',()=>{
    const q=el.dataset.q;
    if(ANS[q]===el.dataset.v){delete ANS[q];$$(`.tfb[data-q="${q}"]`).forEach(b=>b.classList.remove('on'));}
    else{ANS[q]=el.dataset.v;$$(`.tfb[data-q="${q}"]`).forEach(b=>b.classList.toggle('on',b===el));}
    updateProgress();}));
  const af=$('#audioFile');
  if(af){
    af.addEventListener('change',e=>{const f=e.target.files[0];if(!f)return;
      const p=$('#audioPlayer');p.src=URL.createObjectURL(f);p.play().catch(()=>{});});
    try{ fetch('audio/listening.mp3',{method:'HEAD'})
      .then(r=>{if(r.ok)$('#audioPlayer').src='audio/listening.mp3';}).catch(()=>{}); }catch(e){}
  }
}
function updateProgress(){
  const done=ITEMS.filter(i=>String(ANS[i.no]??'').trim()!=='').length;
  $('#prog i').style.width=(done/ITEMS.length*100)+'%';
  $('#progTxt').textContent=`已作答 ${done} / ${ITEMS.length}`;
  $$('#jumpBar a').forEach(a=>a.classList.toggle('done',String(ANS[a.dataset.n]??'').trim()!==''));
}

/* ═════════ 流程 ═════════ */
async function startExam(){
  const name=$('#f_name').value.trim();
  if(!name){toast('请先填写姓名 / Vui lòng nhập họ tên');return;}
  const btn=$('#btnStart'); btn.disabled=true; btn.textContent='连线中……';
  try{
    const s=await api('/api/start',{name});
    TOKEN=s.token;
  }catch(err){
    btn.disabled=false; btn.textContent='开始作答';
    toast('无法连上评分伺服器：'+err.message); return;
  }
  META={name,sbd:$('#f_sbd').value.trim(),cls:$('#f_class').value.trim()};
  TIMED=$('#m_timed').checked; LEFT=EXAM.meta.duration*60;
  $('#setup').classList.add('hidden'); $('#examArea').classList.remove('hidden'); $('#topbar').classList.remove('hidden');
  if(TIMED){TIMER=setInterval(tick,1000);tick();}
  else{$('#clock').textContent='练习模式';$('#clock').style.fontSize='14px';}
  window.scrollTo(0,0);
  window.addEventListener('beforeunload',e=>{if(!DONE){e.preventDefault();e.returnValue='';}});
}
function tick(){
  const c=$('#clock');
  if(LEFT<=0){clearInterval(TIMER);c.textContent='00:00:00';finish(true);return;}
  LEFT--;
  c.textContent=[Math.floor(LEFT/3600),Math.floor(LEFT%3600/60),LEFT%60].map(x=>String(x).padStart(2,'0')).join(':');
  c.className='clock'+(LEFT<=300?' danger':LEFT<=900?' warn':'');
}
async function finish(auto){
  if(DONE) return;
  const done=ITEMS.filter(i=>String(ANS[i.no]??'').trim()!=='').length;
  if(!auto&&!confirm(`确定交卷吗？\n已作答 ${done} / ${ITEMS.length} 题。\n交卷后由伺服器评分，立即显示成绩。`))return;
  DONE=true; clearInterval(TIMER);
  $('#grading').classList.remove('hidden');
  let data;
  try{
    data=await api('/api/grade',{token:TOKEN, student:META, answers:ANS});
  }catch(err){
    DONE=false; $('#grading').classList.add('hidden');
    alert('评分失败：'+err.message+'\n\n你的作答还留在页面上，请检查网路后再按一次交卷。');
    return;
  }
  $('#grading').classList.add('hidden');
  RESULT=data;
  $('#examArea').classList.add('hidden'); $('#topbar').classList.add('hidden');
  renderResult(auto); window.scrollTo(0,0);
}
function renderResult(auto){
  const res=RESULT.detail, total=RESULT.total, per=RESULT.per, max=RESULT.max;
  const pct=total/max*100;
  const grade=pct>=90?'Xuất sắc 优':pct>=75?'Giỏi 良':pct>=60?'Khá 中上':pct>=50?'Trung bình 中':'Cần cố gắng 待加强';
  let h=`<div class="result-hero">
    <div class="nm">${esc(META.name)}${META.sbd?'　·　SBD '+esc(META.sbd):''}${META.cls?'　·　'+esc(META.cls):''}${auto?'　·　时间到自动交卷':''}</div>
    <div><span class="score">${fmt(total)}</span> <span class="of">/ ${max}</span>
      <span style="margin-left:14px;font-size:14px;opacity:.8">${grade}　·　${pct.toFixed(0)}%</span></div>
    <div class="bars">`+EXAM.parts.map(p=>
      `<div class="bar"><span>${esc(p.title.replace('第','').replace('部分：',' '))}</span>
       <span class="track"><i style="width:${Math.max(0,Math.min(100,(per[p.id]||0)/p.points*100))}%"></i></span>
       <span class="v">${fmt(per[p.id]||0)}/${p.points}</span></div>`).join('')+`</div>
    <div style="margin-top:16px;font-size:11.5px;opacity:.55">由伺服器评分　·　${new Date(RESULT.gradedAt).toLocaleString()}　·　用时 ${Math.round(RESULT.elapsedSec/60)} 分钟</div></div>`;

  const wrong=ITEMS.filter(i=>res[i.no].verdict!=='full');
  h+=`<div class="panel"><h2>总览</h2>
    <div class="facts" style="gap:8px 26px">
      <span><b>${ITEMS.filter(i=>res[i.no].verdict==='full').length}</b> 题满分</span>
      <span><b>${ITEMS.filter(i=>res[i.no].verdict==='part').length}</b> 题部分分</span>
      <span><b>${ITEMS.filter(i=>res[i.no].verdict==='zero'&&!res[i.no].blank).length}</b> 题错</span>
      <span><b>${ITEMS.filter(i=>res[i.no].blank).length}</b> 题未作答</span></div>
    ${RESULT.reveal?'':`<div class="note" style="margin-top:14px">${esc(RESULT.revealNote)}</div>`}
    <div class="jump" id="jumpResult"></div>
    <div style="display:flex;gap:10px;margin-top:18px;flex-wrap:wrap">
      <button class="btn ghost" id="btnOnlyWrong">只看错题 (${wrong.length})</button>
      <button class="btn ghost" id="btnDl">下载成绩单</button>
      <button class="btn ghost" id="btnPrint">打印 / 存成 PDF</button>
      <button class="btn seal" id="btnAgain">重新作答</button></div></div>`;

  EXAM.parts.forEach(p=>{
    h+=`<div class="part"><div class="part-head"><h2>${esc(p.title)}</h2><span class="pts">${fmt(per[p.id]||0)} / ${p.points} 分</span></div>`;
    p.sections.forEach(sec=>{
      h+=`<div class="sec"><div class="sec-head"><h3>${esc(sec.title)}</h3></div>`;
      sec.items.forEach(i=>{
        const r=res[i.no], mine=String(ANS[i.no]??'').trim();
        const qt=(sec.type==='gridfill'?`第 ${i.no} 空`:(i.text||'')).replace(/<[^>]+>/g,'');
        h+=`<div class="gq ${r.verdict==='full'?'auto-ok':r.verdict==='part'?'manual':'auto-no'}" data-v="${r.verdict}" id="r${i.no}">
          <div class="gq-head"><span class="qn">${i.no}</span>
            <span style="font-family:var(--serif);font-size:13.5px;color:var(--ink2);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(qt)}</span>
            ${r.low?'<span class="flag">听力·参考答案</span>':''}
            <span class="verdict v-${r.verdict}">${r.verdict==='full'?'满分':r.verdict==='part'?'部分分':(r.blank?'未作答':'不得分')}</span>
            <span class="scorebox"><b style="font-size:15px;color:${r.verdict==='full'?'var(--ok)':r.verdict==='part'?'var(--gold)':'var(--seal)'}">${fmt(r.score)}</b><span class="max">/ ${i.pts}</span></span></div>
          <div class="ans${mine?'':' empty'}">${mine?esc(mine):'未作答'}</div>
          ${r.ref?`<div class="refbox"><span class="lab">参考答案</span>${esc(r.ref)}</div>`:''}
          ${(r.sim!==undefined||r.cov!==undefined)?`<div class="simbar"><i style="width:${Math.round((r.cov??r.sim)*100)}%"></i></div>
            <div class="simnote">${r.cov!==undefined?`要点覆盖 ${r.covHit}/${r.covAll}　·　`:''}文字相似度 ${Math.round((r.sim||0)*100)}%${r.forbidden?'　·　<b style="color:var(--seal)">病句未改正</b>':''}</div>`:''}
        </div>`;
      });
      h+=`</div>`;
    });
    h+=`</div>`;
  });
  $('#resultBody').innerHTML=h;
  $('#resultWrap').classList.remove('hidden');
  $('#jumpResult').innerHTML=ITEMS.map(i=>`<a href="#r${i.no}" class="${res[i.no].verdict==='full'?'full':res[i.no].verdict==='part'?'part':'zero'}">${i.no}</a>`).join('');
  let only=false;
  $('#btnOnlyWrong').onclick=e=>{only=!only;
    $$('#resultBody .gq').forEach(g=>g.classList.toggle('hidden',only&&g.dataset.v==='full'));
    e.target.textContent=only?`显示全部 (${ITEMS.length})`:`只看错题 (${wrong.length})`;};
  $('#btnDl').onclick=()=>download(`result_${safeName(META.sbd||META.name)}.json`,{
    kind:'exam-result',examId:EXAM.meta.id,student:META,total,max,per:RESULT.per,
    answers:ANS,detail:res,gradedAt:RESULT.gradedAt});
  $('#btnPrint').onclick=()=>window.print();
  $('#btnAgain').onclick=()=>location.reload();
}

/* ═════════ 老師：答案卡編輯（#key，需密碼）═════════ */
function keyLogin(){
  $('#app').classList.add('hidden'); $('#keyPage').classList.remove('hidden');
  $('#keyLock').classList.remove('hidden');
  $('#btnKeyLogin').onclick=async()=>{
    const b=$('#btnKeyLogin'); b.disabled=true; b.textContent='验证中……';
    try{
      const d=await api('/api/answers',{password:$('#f_pw').value});
      KEYS=d.keys; LOW=new Set(d.low||[]);
      $('#keyLock').classList.add('hidden'); keyEditor();
    }catch(err){ toast(err.message); }
    b.disabled=false; b.textContent='进入';
  };
  $('#f_pw').addEventListener('keydown',e=>{if(e.key==='Enter')$('#btnKeyLogin').click();});
}
function keyEditor(){
  $('#keyEdit').classList.remove('hidden');
  $('#keyBody').innerHTML=ITEMS.map(i=>{
    const k=KEYS[String(i.no)]||{}, lo=LOW.has(String(i.no));
    let f='';
    if(k.mode==='choice') f=`<div class="kfield"><label>正确答案</label><input data-f="a" data-n="${i.no}" value="${esc(k.a||'')}"></div>`;
    else if(k.mode==='exact') f=`<div class="kfield"><label>可接受答案（用 / 分隔同义词）</label><input data-f="a" data-n="${i.no}" value="${esc(k.a||'')}"></div>`;
    else if(k.mode==='order') f=`<div class="kfield"><label>标准句子</label><textarea data-f="ref" data-n="${i.no}" rows="2">${esc(k.ref||'')}</textarea></div>`;
    else f=`<div class="kfield"><label>标准答案</label><textarea data-f="ref" data-n="${i.no}" rows="3">${esc(k.ref||'')}</textarea></div>
      <div class="kfield"><label>得分要点（每行一个要点，同义说法用 / 分隔）</label>
        <textarea data-f="must" data-n="${i.no}" rows="${Math.max(2,(k.must||[]).length)}">${esc((k.must||[]).map(g=>g.join('/')).join('\n'))}</textarea></div>
      <div class="kfield"><label>病句禁词（用 / 分隔，留空表示不检查）</label>
        <input data-f="forbid" data-n="${i.no}" value="${esc((k.forbid||[]).join('/'))}"></div>`;
    return `<div class="gq ${lo?'manual':''}"><div class="gq-head"><span class="qn">${i.no}</span>
      <span class="meta-s">${k.mode||'—'}　·　${i.pts} 分${lo?'　·　听力推定答案，建议核对录音稿':''}</span></div>${f}</div>`;
  }).join('');
  $$('#keyBody [data-n]').forEach(el=>el.addEventListener('input',()=>{
    const k=KEYS[el.dataset.n]; if(!k)return;
    const f=el.dataset.f, v=el.value;
    if(f==='must') k.must=v.split('\n').map(l=>l.split('/').map(s=>s.trim()).filter(Boolean)).filter(g=>g.length);
    else if(f==='forbid') k.forbid=v.split('/').map(s=>s.trim()).filter(Boolean);
    else k[f]=v;
  }));
  $('#btnKeyDl').onclick=()=>{
    download('answers.json',{low:[...LOW],keys:KEYS});
    toast('已下载。请覆盖专案根目录的 answers.json 后重新部署');
  };
}

/* ═════════ 啟動 ═════════ */
async function boot(){
  try{
    const r=await fetch('data/exam.json',{cache:'no-store'});
    if(!r.ok) throw new Error('data/exam.json → HTTP '+r.status);
    EXAM=await r.json();
  }catch(err){
    $('#boot').innerHTML=`<h2 style="font-family:var(--serif)">读不到题目档案</h2>
      <p class="meta-s" style="margin:10px 0 18px">${esc(err.message)}</p>
      <div class="note" style="text-align:left">这个版本需要跑在伺服器上（Vercel 或本机 <code>vercel dev</code>），
      不能用滑鼠双击 <code>index.html</code> 开启。</div>`;
    return;
  }
  ITEMS=[]; EXAM.parts.forEach(p=>p.sections.forEach(s=>s.items.forEach(i=>ITEMS.push({...i,partId:p.id}))));
  BYNO={}; ITEMS.forEach(i=>BYNO[i.no]=i);
  const m=EXAM.meta;
  $$('[data-bind]').forEach(el=>{
    const v={org:m.org,title:m.title,subject:m.subject,year:m.year,
             total:m.total,duration:m.duration,count:ITEMS.length}[el.dataset.bind];
    if(v!==undefined) el.textContent=v;
  });
  document.title=`${m.subject} · 在线考卷`;
  $('#boot').classList.add('hidden');

  if(location.hash==='#key'){ keyLogin(); return; }
  $('#app').classList.remove('hidden');
  renderExam();
  $('#jumpBar').innerHTML=ITEMS.map(i=>`<a href="#in${i.no}" data-n="${i.no}">${i.no}</a>`).join('');
  updateProgress();
  $('#btnStart').addEventListener('click',startExam);
  $('#btnSubmit').addEventListener('click',()=>finish(false));
  $('#btnSubmit2').addEventListener('click',()=>finish(false));
  $$('.rmode label').forEach(l=>l.addEventListener('click',()=>setTimeout(()=>
    $$('.rmode label').forEach(x=>x.classList.toggle('on',x.querySelector('input').checked)),0)));
}
document.addEventListener('DOMContentLoaded',boot);
