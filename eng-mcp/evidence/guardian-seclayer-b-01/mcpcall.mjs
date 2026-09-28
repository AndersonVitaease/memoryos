import fs from 'node:fs';
const cfg=JSON.parse(fs.readFileSync('/root/.claude.json','utf8'));
let srv; (function w(o){ if(o&&typeof o==='object'){ if(o.mcpServers&&o.mcpServers['memoryos-engmcp']) srv=o.mcpServers['memoryos-engmcp']; for(const v of Object.values(o)) w(v);} })(cfg);
const url=srv.url, headers={...srv.headers,'content-type':'application/json',accept:'application/json, text/event-stream'};
async function rpc(method,params,sid,id=1){ const h={...headers}; if(sid) h['mcp-session-id']=sid;
  const r=await fetch(url,{method:'POST',headers:h,body:JSON.stringify({jsonrpc:'2.0',id,method,params})});
  const t=await r.text(); let body=t; const m=t.match(/^data: (.*)$/m); if(m) body=m[1];
  return {sid:r.headers.get('mcp-session-id')||sid,status:r.status,body:(()=>{try{return JSON.parse(body)}catch{return body}})()};}
const [,,tool,argsJson]=process.argv;
const init=await rpc('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'guardian-seclayer-b-01',version:'1'}});
const sid=init.sid;
if(sid){ const h={...headers,'mcp-session-id':sid}; await fetch(url,{method:'POST',headers:h,body:JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})}); }
const t0=Date.now();
const res = tool==='__list' ? await rpc('tools/list',{},sid,2) : await rpc('tools/call',{name:tool,arguments:JSON.parse(argsJson||'{}')},sid,2);
console.log(JSON.stringify({latencyMs:Date.now()-t0,status:res.status,result:res.body},null,1));
