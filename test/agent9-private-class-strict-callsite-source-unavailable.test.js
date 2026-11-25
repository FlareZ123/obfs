'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {mkdtemp,writeFile,rm}=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');

/**
 * @returns {Promise<{value:number,frames:Array<{file:string|null,functionName:string|null,functionAvailable:boolean,line:number|null,column:number|null}>}>}
 */
async function captureStrictCallSites() {
  const directory=await mkdtemp(path.join(os.tmpdir(),'obfs-strict-callsite-'));
  try {
    const preload=path.join(directory,'preload.cjs');
    const runner=path.join(directory,'runner.cjs');
    const target=path.join(directory,'target.cjs');
    await writeFile(preload,
      "Error.prepareStackTrace=function captureCallSites(error,sites){\n"+
      "  globalThis.__obfsStrictCallSites=sites.map(site=>({\n"+
      "    file:site.getFileName(),functionName:site.getFunctionName(),\n"+
      "    functionAvailable:site.getFunction()!==undefined,\n"+
      "    line:site.getLineNumber(),column:site.getColumnNumber()\n"+
      "  }));\n"+
      "  return 'captured';\n"+
      "};\n"+
      "globalThis.__captureStrictCallSites=function captureStrictCallSites(){\n"+
      "  const error=new Error('strict CallSite probe');\n"+
      "  void error.stack;\n"+
      "};\n",'utf8');
    await writeFile(runner,
      "globalThis.__obfsStrictCallSites=[];\n"+
      "const value=require(process.argv[2]);\n"+
      "process.stdout.write(JSON.stringify({value,frames:globalThis.__obfsStrictCallSites}));\n",
      'utf8');
    await writeFile(target,
      "'use strict';\n"+
      "function strictWorker(){globalThis.__captureStrictCallSites();}\n"+
      "strictWorker();\n"+
      "module.exports=42;\n",'utf8');
    const child=spawnSync(process.execPath,['-r',preload,runner,target],{
      encoding:'utf8',timeout:10000
    });
    assert.equal(child.error,undefined);
    assert.equal(child.status,0,child.stderr);
    return /** @type {{value:number,frames:Array<{file:string|null,functionName:string|null,functionAvailable:boolean,line:number|null,column:number|null}>}} */ (JSON.parse(child.stdout));
  } finally {
    await rm(directory,{recursive:true,force:true});
  }
}

test('strict CommonJS wrapper and inner frames hide CallSite.getFunction from a sloppy host observer',async()=>{
  const result=await captureStrictCallSites();
  assert.equal(result.value,42);
  const targetFrames=result.frames.filter(frame=>frame.file&&frame.file.endsWith('target.cjs'));
  assert.ok(targetFrames.length>=2,'the observer must capture both the strict worker and wrapper frames');
  assert.ok(targetFrames.some(frame=>frame.functionName==='strictWorker'),
    'the strict inner function frame must remain identifiable by name');
  assert.ok(targetFrames.every(frame=>frame.functionAvailable===false),
    'V8 must withhold function objects for every strict target frame');
  process.stdout.write('AGENT9_STRICT_CALLSITE_SOURCE_UNAVAILABLE '+JSON.stringify({
    targetFrames
  })+'\n');
});
