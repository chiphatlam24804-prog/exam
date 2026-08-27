
'use strict';
/* 老師專用：憑密碼取得答案卡，供 #key 頁面編輯。
   沒有設定環境變數 TEACHER_PASSWORD 時，這個端點一律拒絕。 */
const crypto = require('crypto');
const {book, readBody} = require('./_lib');

function samePassword(given){
  const want = process.env.TEACHER_PASSWORD || '';
  if(!want) return false;
  const a = crypto.createHash('sha256').update(String(given||'')).digest();
  const b = crypto.createHash('sha256').update(want).digest();
  return crypto.timingSafeEqual(a,b);
}

module.exports = async (req, res) => {
  if(req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});
  if(!process.env.TEACHER_PASSWORD)
    return res.status(403).json({error:'尚未启用。请在 Vercel 设定环境变数 TEACHER_PASSWORD 后再试。'});

  let body = {};
  try{ body = await readBody(req); }catch(e){ return res.status(400).json({error:e.message}); }

  await new Promise(r=>setTimeout(r, 400));           // 稍微拖慢暴力猜密码
  if(!samePassword(body.password)) return res.status(401).json({error:'密码不正确'});

  const bk = book();
  res.setHeader('Cache-Control','no-store');
  res.status(200).json({keys: bk.keys, low: [...bk.low]});
};
