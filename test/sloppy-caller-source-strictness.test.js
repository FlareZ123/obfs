'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {mkdtemp,writeFile,rm}=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');

/**
 * Execute a real Node CommonJS target under a sloppy preloaded host callback.
 * @param {boolean} strict
 * @returns {Promise<{value:number,observations:(string|null)[]}>}
 */
async function observeCommonJsCaller(strict) {
  const directory=await mkdtemp(path.join(os.tmpdir(),'obfs-caller-strictness-'));
  try {
    const preload=path.join(directory,'preload.cjs');
    const runner=path.join(directory,'runner.cjs');
    const target=path.join(directory,'target.cjs');
    await writeFile(preload,
      "const nativeIsArray=Array.isArray;\n"+
      "Array.isArray=function observedIsArray(value){\n"+
      "  if(globalThis.__obfsCallerProbeArmed){\n"+
      "    const caller=arguments.callee.caller;\n"+
      "    globalThis.__obfsCallerProbeObservations.push(\n"+
      "      caller?Function.prototype.toString.call(caller):null);\n"+
      "  }\n"+
      "  return nativeIsArray(value);\n"+
      "};\n",'utf8');
    await writeFile(runner,
      "globalThis.__obfsCallerProbeArmed=false;\n"+
      "globalThis.__obfsCallerProbeObservations=[];\n"+
      "const value=require(process.argv[2]);\n"+
      "process.stdout.write(JSON.stringify({value,observations:globalThis.__obfsCallerProbeObservations}));\n",
      'utf8');
    const source=(strict?"'use strict';\n":"")+
      "const owner={secretField:17};\n"+
      "/* caller-probe-wrapper */\n"+
      "globalThis.__obfsCallerProbeArmed=true;Array.isArray([1,2]);globalThis.__obfsCallerProbeArmed=false;\n"+
      "function privateWorker(){\n"+
      "  /* caller-probe-worker */\n"+
      "  globalThis.__obfsCallerProbeArmed=true;Array.isArray([1,2]);globalThis.__obfsCallerProbeArmed=false;\n"+
      "  return owner.secretField;\n"+
      "}\n"+
      "module.exports=privateWorker()+4;\n";
    await writeFile(target,source,'utf8');
    const child=spawnSync(process.execPath,['-r',preload,runner,target],{
      encoding:'utf8',timeout:10000
    });
    assert.equal(child.error,undefined);
    assert.equal(child.status,0,child.stderr);
    /** @type {{value:number,observations:(string|null)[]}} */
    const result=JSON.parse(child.stdout);
    return result;
  } finally {
    await rm(directory,{recursive:true,force:true});
  }
}

test('sloppy CommonJS exposes wrapper and direct-called worker source to a preloaded host',async()=>{
  const result=await observeCommonJsCaller(false);
  assert.equal(result.value,21);
  assert.equal(result.observations.length,2);
  assert.match(result.observations[0]??'null',/caller-probe-wrapper/);
  assert.match(result.observations[1]??'null',/caller-probe-worker/);
});

test('strict CommonJS blocks the same sloppy host caller-source probe',async()=>{
  const result=await observeCommonJsCaller(true);
  assert.equal(result.value,21);
  assert.deepEqual(result.observations,[null,null]);
});
