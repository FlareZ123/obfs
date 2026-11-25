'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {mkdtemp,writeFile,rm}=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');

/**
 * Run a real CommonJS module under a preloaded sloppy host source observer.
 * @param {string} source
 * @returns {Promise<{value:number,observed:string|null}>}
 */
async function observeWrapper(source) {
  const directory=await mkdtemp(path.join(os.tmpdir(),'obfs-private-arrow-main-baseline-'));
  try {
    const preload=path.join(directory,'preload.cjs');
    const runner=path.join(directory,'runner.cjs');
    const target=path.join(directory,'target.cjs');
    await writeFile(preload,
      "const nativeIsArray=Array.isArray;\n"+
      "Array.isArray=function observedIsArray(value){\n"+
      "  if(globalThis.__obfsArrowCjsArmed){\n"+
      "    const caller=arguments.callee.caller;\n"+
      "    globalThis.__obfsArrowCjsObserved=caller?Function.prototype.toString.call(caller):null;\n"+
      "  }\n"+
      "  return nativeIsArray(value);\n"+
      "};\n",'utf8');
    await writeFile(runner,
      "globalThis.__obfsArrowCjsArmed=false;\n"+
      "globalThis.__obfsArrowCjsObserved=null;\n"+
      "const value=require(process.argv[2]);\n"+
      "process.stdout.write(JSON.stringify({value,observed:globalThis.__obfsArrowCjsObserved}));\n",
      'utf8');
    await writeFile(target,source,'utf8');
    const child=spawnSync(process.execPath,['-r',preload,runner,target],{
      encoding:'utf8',timeout:10000
    });
    assert.equal(child.error,undefined);
    assert.equal(child.status,0,child.stderr);
    return /** @type {{value:number,observed:string|null}} */ (JSON.parse(child.stdout));
  } finally {
    await rm(directory,{recursive:true,force:true});
  }
}

for(const mode of /** @type {Array<'coo'|'sno'|'sco'>} */ (['coo','sno','sco'])) {
  test(mode+' mainline baseline exposes private-arrow property rewrite through sloppy CJS wrapper source',async()=>{
    const source=[
      'const owner={privateField:7};',
      'const read=()=>{return owner.privateField;};',
      'const value=read();',
      'globalThis.__obfsArrowCjsArmed=true;Array.isArray([1,2]);globalThis.__obfsArrowCjsArmed=false;',
      'module.exports=value;'
    ].join('');
    const output=obfuscateFiles([{
      path:'private-arrow.cjs',sourceType:'commonjs',code:source
    }],{
      mode,closedWorld:true,seed:'private-arrow-cjs-main-baseline/'+mode,
      properties:true,identifiers:false,strings:false
    });
    const native=await observeWrapper(source);
    const emitted=await observeWrapper(String(output.files[0].code));
    assert.equal(native.value,7);
    assert.equal(emitted.value,7);
    assert.match(native.observed??'',/privateField/);
    assert.ok(emitted.observed,'the host preloader must observe the emitted module wrapper');
    assert.equal(output.files[0].metrics.properties,1,
      'mainline is expected to admit the direct-call-only const arrow reader');
    assert.notEqual(emitted.observed,native.observed,
      'the generated wrapper source must differ from native after the admitted property rewrite');
    assert.doesNotMatch(emitted.observed??'',/privateField/);
  });
}
