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
  const directory=await mkdtemp(path.join(os.tmpdir(),'obfs-private-class-host-caller-'));
  try {
    const preload=path.join(directory,'preload.cjs');
    const runner=path.join(directory,'runner.cjs');
    const target=path.join(directory,'target.cjs');
    await writeFile(preload,
      "const nativeIsArray=Array.isArray;\n"+
      "Array.isArray=function observedIsArray(value){\n"+
      "  if(globalThis.__obfsPrivateClassArmed){\n"+
      "    const caller=arguments.callee.caller;\n"+
      "    globalThis.__obfsPrivateClassObserved=caller?Function.prototype.toString.call(caller):null;\n"+
      "  }\n"+
      "  return nativeIsArray(value);\n"+
      "};\n",'utf8');
    await writeFile(runner,
      "globalThis.__obfsPrivateClassArmed=false;\n"+
      "globalThis.__obfsPrivateClassObserved=null;\n"+
      "const value=require(process.argv[2]);\n"+
      "process.stdout.write(JSON.stringify({value,observed:globalThis.__obfsPrivateClassObserved}));\n",
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

for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
  test(mode+' refuses private-class rewrite when a sloppy CJS host can observe the module wrapper',async()=>{
    const source=[
      'const owner={privateField:7};',
      'class Reader{read(){return owner.privateField;}}',
      'const reader=new Reader();',
      'globalThis.__obfsPrivateClassArmed=true;Array.isArray([1,2]);globalThis.__obfsPrivateClassArmed=false;',
      'module.exports=reader.read();'
    ].join('');
    const output=obfuscateFiles([{
      path:'private-class.cjs',sourceType:'commonjs',code:source
    }],{
      mode,seed:'private-class-host-caller-sloppy/'+mode,
      properties:true,identifiers:false,strings:false
    });
    assert.equal(output.files[0].metrics.properties,0);
    assert.equal(output.files[0].code,source);
    const native=await observeWrapper(source);
    const emitted=await observeWrapper(output.files[0].code);
    assert.equal(native.value,7);
    assert.equal(emitted.value,7);
    assert.match(native.observed??'',/privateField/);
    assert.match(emitted.observed??'',/privateField/);
  });

  test(mode+' admits strict CJS private-class proof only when wrapper caller is hidden',async()=>{
    const source=[
      "'use strict';",
      'const owner={privateField:7};',
      'class Reader{read(){return owner.privateField;}}',
      'const reader=new Reader();',
      'globalThis.__obfsPrivateClassArmed=true;Array.isArray([1,2]);globalThis.__obfsPrivateClassArmed=false;',
      'module.exports=reader.read();'
    ].join('');
    const output=obfuscateFiles([{
      path:'private-class.cjs',sourceType:'commonjs',code:source
    }],{
      mode,seed:'private-class-host-caller-strict/'+mode,
      properties:true,identifiers:false,strings:false
    });
    assert.equal(output.files[0].metrics.properties,1);
    assert.doesNotMatch(output.files[0].code,/privateField/u);
    const native=await observeWrapper(source);
    const emitted=await observeWrapper(output.files[0].code);
    assert.equal(native.value,7);
    assert.equal(emitted.value,7);
    assert.equal(native.observed,null);
    assert.equal(emitted.observed,null);
  });
}
