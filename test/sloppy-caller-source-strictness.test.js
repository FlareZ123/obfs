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


/**
 * Run an arbitrary CommonJS source file with the same preloaded sloppy caller
 * observer used above.
 * @param {string} source
 * @returns {Promise<{value:number,observations:(string|null)[]}>}
 */
async function executeWithHostProbe(source) {
  const directory=await mkdtemp(path.join(os.tmpdir(),'obfs-caller-obfuscation-'));
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

test('sloppy host caller reflection distinguishes strict and sloppy CommonJS across all modes',async()=>{
  const {obfuscateFiles}=require('../src');
  for(const mode of ['coo','sno','sco']) {
    for(const strict of [false,true]) {
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
      const output=obfuscateFiles([{
        path:'target.cjs',sourceType:'commonjs',code:source
      }],{
        mode,closedWorld:true,properties:true,identifiers:false,strings:false,
        seed:'sloppy-caller-source-'+mode+'-'+strict
      });
      assert.ok(output.files[0].metrics.properties>=1,JSON.stringify(output.files[0]));
      const native=await executeWithHostProbe(source);
      const emitted=await executeWithHostProbe(output.files[0].code);
      assert.equal(native.value,21,mode);
      assert.equal(emitted.value,21,mode);
      if(strict) {
        assert.deepEqual(native.observations,[null,null],mode);
        assert.deepEqual(emitted.observations,[null,null],mode);
      } else {
        assert.equal(native.observations.length,2,mode);
        assert.equal(emitted.observations.length,2,mode);
        assert.match(native.observations[0]??'',/caller-probe-wrapper/);
        assert.match(native.observations[1]??'',/caller-probe-worker/);
        assert.doesNotMatch(emitted.observations[0]??'',/secretField/);
        assert.doesNotMatch(emitted.observations[1]??'',/secretField/);
      }
    }
  }
});
