'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {pathToFileURL}=require('node:url');

/**
 * Match the original application-challenge host capability in the isolated
 * native child. The parent compares complete ordered JSON output digests with
 * the real server-hosted implementation on every trial.
 * @param {number} value
 * @returns {number}
 */
function externalValue(value){
  let x=(value^0xa5a5a5a5)>>>0;
  x=Math.imul(x^(x>>>16),0x45d9f3b)>>>0;
  return (x^(x>>>16))>>>0;
}

/**
 * One fresh child-process session. Whole-process CPU is cumulative since
 * process creation, including Node startup, the ESM import and JSON work.
 * The trusted HTTP server lives in the parent; parent CPU is accounted there.
 * @param {string[]} args
 * @returns {Promise<{
 *  mode:string,calls:number,cpuMs:number,outputSha256:string,
 *  publicSourceSha256:string|null
 * }>}
 */
async function main(args){
  const [mode,origin,token,countText,totalText,nativePath,publicPath]=args;
  // Both remote variants download and execute their own published ESM file.
  // The ordinary variant is the equal-trust esbuild-minified RPC baseline.
  assert.ok(mode==='native'||mode==='remote'||mode==='ordinary');
  const iterations=Number(countText),total=Number(totalText);
  assert.ok(Number.isSafeInteger(iterations)&&iterations>=0&&iterations<=1000);
  assert.ok(Number.isSafeInteger(total)&&total>0&&total%1024===0);
  const seeds=[0x12345678,0xffffffff,0x9e3779b9];
  const digest=createHash('sha256');
  let calls=0;
  /** @param {unknown} value @returns {void} */
  function record(value){
    const json=JSON.stringify(value);
    assert.equal(typeof json,'string','Declared JSON-wire value must serialize');
    digest.update(String(Buffer.byteLength(json,'utf8'))+':');
    digest.update(json);
    calls++;
  }
  /** @type {string|null} */
  let publicSourceSha256=null;
  if(mode==='native'){
    globalThis.window=/** @type {Window & typeof globalThis} */ (
      /** @type {unknown} */ ({externalValue}));
    const original=/** @type {{evaluateRemote:(seed:number,count:number)=>Promise<unknown>}} */(
      await import(pathToFileURL(nativePath).href));
    for(let index=0;index<total;index++)
      record(await original.evaluateRemote(seeds[index%seeds.length],iterations));
  }else{
    const rawFetch=globalThis.fetch;
    globalThis.fetch=(input,init)=>{
      const headers=new Headers(init?.headers);
      headers.set('x-batch-token',token);
      return rawFetch(new URL(String(input),origin),{...init,headers});
    };
    const response=await globalThis.fetch('/obfs/'+publicPath);
    assert.equal(response.status,200,'Fresh client source must be authenticated');
    const source=await response.text();
    assert.ok(!source.includes('createEngine'),'Private implementation leaked to client');
    publicSourceSha256=createHash('sha256').update(source).digest('hex');
    const url='data:text/javascript;base64,'+Buffer.from(source,'utf8').toString('base64');
    const compiled=/** @type {{batch:(calls:Array<{name:string,args:number[]}>)=>Promise<Array<{ok:boolean,value:unknown}>>}} */(
      await import(url));
    assert.equal(typeof compiled.batch,'function');
    for(let begin=0;begin<total;begin+=1024){
      const invocations=Array.from({length:1024},(_,offset)=>({
        name:'evaluateRemote',
        args:[seeds[(begin+offset)%seeds.length],iterations]
      }));
      const output=await compiled.batch(invocations);
      assert.equal(output.length,1024);
      for(const item of output){
        assert.equal(item.ok,true);
        record(item.value);
      }
    }
  }
  assert.equal(calls,total);
  const cpu=process.cpuUsage();
  return {
    mode,calls,cpuMs:(cpu.user+cpu.system)/1000,
    outputSha256:digest.digest('hex'),publicSourceSha256
  };
}

if(require.main===module)main(process.argv.slice(2)).then(result=>{
  process.stdout.write(JSON.stringify(result)+'\n');
}).catch(error=>{
  process.stderr.write(String(error.stack||error)+'\n');
  process.exitCode=1;
});

module.exports={main,externalValue};
