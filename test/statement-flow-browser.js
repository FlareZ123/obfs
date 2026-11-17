'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');
const {recoverStatementFlow}=require('../sims/statement-flow-recover');

/** @returns {Promise<void>} */
async function main(){
  const source=[
    'export function route(value,flag){',
    'var x=(value|0)*7;',
    'if(flag){window.hostApi.record("allow");x+=31;}',
    'else if(x>20){window.hostApi.record("fallback");x^=15;}',
    'else{window.hostApi.record("minimum");x-=9;}',
    'return (x^19)|0;',
    '}'
  ].join('');
  const result=obfuscateFiles([{path:'route.mjs',sourceType:'module',code:source}],{
    mode:'coo',seed:'statement-flow-browser-20261116',
    strings:false,properties:false,identifiers:false,
    experimentalStatementFlow:{'route.mjs':['route']}
  });
  assert.equal(result.files[0].metrics.statementFlowFunctions,1);
  const transformed=String(result.files[0].code);
  assert.match(transformed,/switch\(/u);
  const compactSet=obfuscateFiles([{path:'route.mjs',sourceType:'module',code:source}],{
    mode:'coo',seed:'statement-flow-browser-20261116',
    strings:false,properties:false,identifiers:false,
    experimentalStatementFlow:{'route.mjs':['route']},
    experimentalStatementFlowCompact:true
  });
  assert.equal(compactSet.files[0].metrics.statementFlowFunctions,1);
  const compact=String(compactSet.files[0].code);
  assert.ok((compact.match(/case\s+\d+:/gu)||[]).length<
    (transformed.match(/case\s+\d+:/gu)||[]).length);
  const layeredSet=obfuscateFiles([{path:'route.mjs',sourceType:'module',code:source}],{
    mode:'coo',seed:'statement-flow-layered-browser-20261116',
    strings:true,properties:true,identifiers:true,allowedHosts:['127.0.0.1'],
    experimentalStatementFlow:{'route.mjs':['route']}
  });
  assert.equal(layeredSet.files[0].metrics.statementFlowFunctions,1);
  const layered=String(layeredSet.files[0].code);
  assert.match(layered,/Unauthorized execution host/u);
  const compactLayeredSet=obfuscateFiles([{path:'route.mjs',sourceType:'module',code:source}],{
    mode:'coo',seed:'statement-flow-layered-browser-20261116',
    strings:true,properties:true,identifiers:true,allowedHosts:['127.0.0.1'],
    experimentalStatementFlow:{'route.mjs':['route']},
    experimentalStatementFlowCompact:true
  });
  assert.equal(compactLayeredSet.files[0].metrics.statementFlowFunctions,1);
  const compactLayered=String(compactLayeredSet.files[0].code);
  assert.match(compactLayered,/Unauthorized execution host/u);
  // Source-only reconstruction: the browser executes an attacker recovered
  // function without the original compiler seed or original implementation.
  const attacker=recoverStatementFlow(compact,'route','module').code;
  const html="<!doctype html><html><body><div id=\"answer\">pending</div><script type=\"module\">\nimport {route as native} from '/native.mjs';\nimport {route as obfuscated} from '/obfuscated.mjs';\nimport {route as layered} from '/layered.mjs';\nimport {route as compact} from '/compact.mjs';\nimport {route as compactLayered} from '/compact-layered.mjs';\nimport {route as attacker} from '/attacker.mjs';\nconst events=[];\nwindow.hostApi={record(name){events.push(name)}};\nfunction invoke(fn,value,flag){\n  events.length=0;\n  try{return ['ok',fn(value,flag),events.join('|')];}\n  catch(error){return ['error',error.name,events.join('|')];}\n}\nconst values=[];\nfor(let x=-2048;x<=2048;x++)values.push(x);\nvalues.push('5','',true,false,null,undefined,NaN,Infinity,-Infinity,0n,7n,Symbol('t'));\nlet count=0;\nfor(const value of values){\n  for(const flag of [true,false]){\n    const a=invoke(native,value,flag),b=invoke(obfuscated,value,flag),c=invoke(layered,value,flag);\n    const d=invoke(compact,value,flag),e=invoke(compactLayered,value,flag),f=invoke(attacker,value,flag);\n    if([b,c,d,e,f].some(output=>a.length!==output.length||\n      a.some((item,index)=>!Object.is(item,output[index])))){\n      document.getElementById('answer').textContent='mismatch:'+String(value)+':'+String(flag)+':'+JSON.stringify(a)+':'+JSON.stringify(b);\n      throw Error('Statement flow browser mismatch');\n    }\n    count++;\n  }\n}\ndocument.getElementById('answer').textContent='pass:'+count;\n</script></body></html>";
  const payload=new Map([
    ['/index.html',{type:'text/html',body:html}],
    ['/native.mjs',{type:'text/javascript',body:source}],
    ['/obfuscated.mjs',{type:'text/javascript',body:transformed}],
    ['/layered.mjs',{type:'text/javascript',body:layered}],
    ['/compact.mjs',{type:'text/javascript',body:compact}],
    ['/compact-layered.mjs',{type:'text/javascript',body:compactLayered}],
    ['/attacker.mjs',{type:'text/javascript',body:attacker}]
  ]);
  const server=http.createServer((request,response)=>{
    const file=payload.get(new URL(request.url??'/', 'http://127.0.0.1').pathname);
    if(!file){response.writeHead(404).end();return;}
    response.writeHead(200,{'content-type':file.type+'; charset=utf-8','cache-control':'no-store'});
    response.end(file.body);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const addr=server.address();
    if(!addr||typeof addr==='string')throw Error('Missing Chromium test port');
    const url='http://127.0.0.1:'+addr.port+'/index.html';
    const {stdout}=await promisify(execFile)(process.env.CHROMIUM_BIN??'chromium',[
      '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
      '--no-first-run','--virtual-time-budget=5000','--dump-dom',url
    ],{timeout:45000,maxBuffer:8*1024*1024,encoding:'utf8'});
    assert.match(stdout,/id="answer">pass:8218</u);
    process.stdout.write('Chromium PASS: 8218 native, flattened, compact, layered, compact locked and public-source attacker COO inputs with host API\n');
  }finally{
    await new Promise(resolve=>server.close(resolve));
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
