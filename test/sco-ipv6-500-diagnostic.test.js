'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {obfuscateFiles}=require('../src/core');
const {createScoHandler}=require('../src/sco');

const source='document.getElementById("out").textContent=location.hostname+"|42";';
const safeSource='document.body.firstElementChild.textContent=location.hostname+"|42";';
const input={path:'client.js',sourceType:/** @type {'script'} */('script'),code:source};
const safeInput={...input,code:safeSource};

test('source-observable IPv6 fixture is explicitly refused by host-lock proof',()=>{
  for(const seed of ['0'.repeat(48),'1'.repeat(48)]) {
    assert.throws(()=>obfuscateFiles([input],{
      mode:'sco',seed,allowedHosts:['[::1]'],properties:true,identifiers:true
    }),/Host locking cannot preserve observable source bytes/);
  }
});

test('source-safe IPv6 host-lock compiler emits parseable JS for 128 deterministic SCO seeds',{
  timeout:60000
},()=>{
  /** @type {{seed:string,error:string}[]} */
  const failures=[];
  for(let i=0;i<128;i++){
    const seed=i.toString(16).padStart(48,'0');
    try{
      const result=obfuscateFiles([safeInput],{
        mode:'sco',seed,allowedHosts:['[::1]'],properties:true,identifiers:true
      });
      assert.equal(result.files.length,1);
      const code=result.files[0].code;
      assert.equal(typeof code,'string');
      // Parse only. This host guard deliberately checks browser globals on run.
      new Function(/** @type {string} */(code));
    }catch(error){
      failures.push({seed,error:/** @type {Error} */(error).stack??String(error)});
      if(failures.length>=5)break;
    }
  }
  assert.deepEqual(failures,[],
    'Compiler errors from browser fixture, without HTTP or Chromium');
});

test('source-safe IPv6 Node HTTP SCO static script delivery succeeds for 64 independent requests',{
  timeout:60000
},async()=>{
  const handler=createScoHandler([safeInput],{
    allowedHosts:['[::1]'],publicPaths:['client.js']
  });
  const server=http.createServer(handler);
  await new Promise(resolve=>server.listen(0,'::1',resolve));
  const address=server.address();
  assert.ok(address&&typeof address!=='string');
  const url='http://[::1]:'+address.port+'/obfs/client.js';
  /** @type {{trial:number,status:number,body:string}[]} */
  const failures=[];
  try{
    for(let i=0;i<64;i++){
      const res=await fetch(url,{signal:AbortSignal.timeout(5000)});
      const body=await res.text();
      if(res.status!==200){
        failures.push({trial:i,status:res.status,body:body.slice(0,120)});
        if(failures.length>=5)break;
      }else{
        assert.doesNotThrow(()=>new Function(body));
      }
    }
  }finally{
    await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve()));
  }
  assert.deepEqual(failures,[],
    'Node HTTP delivery against the same IPv6 fixture without Chromium');
});

test('SCO HTTP rejects original source-observable IPv6 script without publishing code',async()=>{
  const handler=createScoHandler([input],{allowedHosts:['[::1]'],publicPaths:['client.js']});
  const server=http.createServer(handler);
  await new Promise(resolve=>server.listen(0,'::1',resolve));
  const addr=server.address();
  assert.ok(addr&&typeof addr!=='string');
  try{
    const response=await fetch('http://[::1]:'+addr.port+'/obfs/client.js');
    assert.equal(response.status,500);
    assert.equal(await response.text(),'Obfuscation failed');
  }finally{
    await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
  }
});

test('diagnostic: distinguish source-observer boundaries across isolated browser expressions',()=>{
  const {parse,observesFunctionSource,observesDistributedSource}=require('../src/ast');
  const samples=[
    ['local-scalar','const obfsWitness=41;'],
    ['global-scalar','globalThis.__obfsWitness=41;'],
    ['global-location','globalThis.__obfsWitness=location.hostname+"|42";'],
    ['window-location','window.__obfsWitness=location.hostname+"|42";'],
    ['document-title','document.title=location.hostname+"|42";'],
    ['dom-first-element','document.body.firstElementChild.textContent=location.hostname+"|42";'],
    ['dom-first-element-static','document.body.firstElementChild.textContent="ok";'],
    ['dom-lookup','document.getElementById("out").textContent=location.hostname+"|42";'],
    ['dom-lookup-static','document.getElementById("out").textContent="ok";'],
    ['self-location','self.__obfsWitness=location.hostname;'],
    ['global-computed','globalThis["__obfsWitness"]=location.hostname;'],
    ['element-ref','const e=document.body.firstElementChild;e.textContent="ok";']
  ];
  /** @type {{name:string,sourceObserver:boolean,distributedObserver:boolean,success:boolean,error:string|null}[]} */
  const outcome=[];
  for(const [name,code] of samples){
    const ast=parse(code,'script');
    let success=false,error=null;
    try {
      obfuscateFiles([{...input,code}],{
        mode:'sco',seed:'7'.repeat(48),allowedHosts:['[::1]'],properties:true,identifiers:true
      });
      success=true;
    } catch(cause) {error=String(cause);}
    outcome.push({
      name,sourceObserver:observesFunctionSource(ast),
      distributedObserver:observesDistributedSource(ast),success,error
    });
  }
  console.log('IPV6_OBSERVER_MATRIX='+JSON.stringify(outcome));
  assert.equal(outcome[0].success,true,'Minimal scalar source must remain obfuscatable');
  assert.equal(outcome.find(row=>row.name==='dom-lookup')?.success,false);
});
