
'use strict';
const {verify, gradeAll, readBody} = require('./_lib');

const MODE = (process.env.REVEAL_ANSWERS || 'timed').toLowerCase();  // always | timed | never
const MIN_MIN = Number(process.env.MIN_MINUTES || 20);

module.exports = async (req, res) => {
  if(req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});

  let body;
  try{ body = await readBody(req); }
  catch(e){ return res.status(400).json({error:e.message}); }

  const session = verify(body.token);
  if(!session) return res.status(401).json({error:'考试凭证无效，请重新整理页面后再作答'});

  const elapsedSec = Math.max(0, Math.round((Date.now() - session.iat)/1000));
  if(elapsedSec > 8*3600) return res.status(401).json({error:'考试凭证已过期，请重新开始'});

  const answers = (body.answers && typeof body.answers==='object') ? body.answers : {};

  let out;
  try{ out = gradeAll(answers); }
  catch(e){ return res.status(500).json({error:'评分失败：'+e.message}); }

  // 是否连同参考答案一起回传
  const reveal = MODE==='always' ? true
               : MODE==='never'  ? false
               : elapsedSec >= MIN_MIN*60;
  if(!reveal){
    Object.values(out.detail).forEach(d=>{ delete d.ref; });
  }

  res.setHeader('Cache-Control','no-store');
  res.status(200).json({
    ...out, reveal,
    revealNote: reveal ? '' : (MODE==='never'
        ? '本次考试不公开参考答案。'
        : `作答未满 ${MIN_MIN} 分钟，本次不显示参考答案。`),
    student: body.student || {},
    elapsedSec,
    gradedAt: new Date().toISOString(),
  });
};
