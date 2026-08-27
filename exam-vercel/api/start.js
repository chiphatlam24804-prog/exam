
'use strict';
const {sign, readBody} = require('./_lib');

module.exports = async (req, res) => {
  if(req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});
  let body = {};
  try{ body = await readBody(req); }catch(e){ return res.status(400).json({error:e.message}); }
  const token = sign({
    iat: Date.now(),
    n: Math.random().toString(36).slice(2,12),
    name: String(body.name||'').slice(0,60),
  });
  res.status(200).json({token, serverTime: Date.now()});
};
