'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const execFileAsync=promisify(execFile);

async function main() {
  const html=[
    '<!doctype html><html><head><meta charset="utf-8"></head><body>',
    '<pre id="result">pending</pre><script>',
    '(() => {',
    '  const result={};',
    '  const original=Object.getOwnPropertyDescriptor(Storage.prototype,"setItem");',
    '  if(!original||typeof original.value!=="function")throw Error("missing native Storage.setItem");',
    '  function inspect(){const privateLocal=29;return privateLocal;}',
    '  const source=Function.prototype.toString.call(inspect);',
    '  const captured=new WeakMap();',
    '  let prototypeCalls=0;',
    '  let ownCalls=0;',
    '  let previousOwn;',
    '  try {',
    '    localStorage.clear();',
    '    original.value.call(localStorage,"baseline-method",inspect);',
    '    result.baselineMethod=localStorage.getItem("baseline-method")===source;',
    '    localStorage["baseline-named"]=inspect;',
    '    result.baselineNamed=localStorage.getItem("baseline-named")===source;',
    '    Object.defineProperty(Storage.prototype,"setItem",{...original,value:function(key,value){',
    '      prototypeCalls++;captured.set(this,value);',
    '    }});',
    '    localStorage.setItem("prototype-method",inspect);',
    '    result.prototypeMethodOverride=prototypeCalls===1&&captured.get(localStorage)===inspect&&',
    '      localStorage.getItem("prototype-method")===null;',
    '    localStorage["prototype-named"]=inspect;',
    '    result.prototypeNamedBypassesMethod=prototypeCalls===1&&',
    '      localStorage.getItem("prototype-named")===source;',
    '    previousOwn=Object.getOwnPropertyDescriptor(localStorage,"setItem");',
    '    Object.defineProperty(localStorage,"setItem",{configurable:true,writable:true,value:function(key,value){',
    '      ownCalls++;captured.set(this,value);',
    '    }});',
    '    localStorage.setItem("own-method",inspect);',
    '    result.ownMethodOverride=ownCalls===1&&captured.get(localStorage)===inspect&&',
    '      localStorage.getItem("own-method")===null;',
    '    localStorage["own-named"]=inspect;',
    '    result.ownNamedBypassesMethod=ownCalls===1&&',
    '      localStorage.getItem("own-named")===source;',
    '    result.prototypeCalls=prototypeCalls;',
    '    result.ownCalls=ownCalls;',
    '  } catch(error) {',
    '    result.error=String(error&&error.stack||error);',
    '  } finally {',
    '    if(previousOwn)Object.defineProperty(localStorage,"setItem",previousOwn);',
    '    else delete localStorage.setItem;',
    '    Object.defineProperty(Storage.prototype,"setItem",original);',
    '    localStorage.clear();',
    '  }',
    '  document.getElementById("result").textContent="PASS "+JSON.stringify(result);',
    '})();',
    '</script></body></html>'
  ].join('\\n');
  const server=http.createServer((request,response)=>{
    if(request.url!=="/"){response.writeHead(404);response.end();return;}
    response.writeHead(200,{"Content-Type":"text/html; charset=utf-8"});
    response.end(html);
  });
  await new Promise((resolve,reject)=>{
    server.once("error",reject);
    server.listen(0,"127.0.0.1",resolve);
  });
  try {
    const address=server.address();
    if(!address||typeof address==="string")throw Error("Expected local TCP server");
    const chrome=process.env.CHROMIUM_BIN??"chromium";
    const {stdout,stderr}=await execFileAsync(chrome,[
      "--headless","--no-sandbox","--disable-gpu","--disable-dev-shm-usage",
      "--no-first-run","--virtual-time-budget=5000","--dump-dom",
      "http://127.0.0.1:"+address.port+"/"
    ],{timeout:45000,maxBuffer:8*1024*1024,encoding:"utf8"});
    assert.match(stdout,/<pre id="result">PASS /,String(stderr));
    const match=stdout.match(/<pre id="result">PASS ([\\s\\S]*?)<\\/pre>/);
    assert.ok(match,"Expected rendered named-setter result");
    const result=JSON.parse(match[1]);
    assert.equal(result.error,undefined,JSON.stringify(result));
    assert.equal(result.baselineMethod,true,JSON.stringify(result));
    assert.equal(result.baselineNamed,true,JSON.stringify(result));
    assert.equal(result.prototypeMethodOverride,true,JSON.stringify(result));
    assert.equal(result.prototypeNamedBypassesMethod,true,JSON.stringify(result));
    assert.equal(result.ownMethodOverride,true,JSON.stringify(result));
    assert.equal(result.ownNamedBypassesMethod,true,JSON.stringify(result));
    assert.equal(result.prototypeCalls,1,JSON.stringify(result));
    assert.equal(result.ownCalls,1,JSON.stringify(result));
    console.log(JSON.stringify({browser:"Chromium",namedSetterDispatch:result}));
  } finally {
    server.closeAllConnections();
    await new Promise(resolve=>server.close(()=>resolve(undefined)));
  }
}

main().catch(error=>{console.error(error);process.exitCode=1;});
