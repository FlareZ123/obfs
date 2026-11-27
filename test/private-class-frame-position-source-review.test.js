'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {mkdtemp,writeFile,rm}=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');

/**
 * Observe the CommonJS caller's V8 stack column from a sloppy host callback.
 * @param {string} source
 * @returns {Promise<{value:number,line:number,column:number,frame:string}>}
 */
async function observeFrame(source) {
  const directory=await mkdtemp(path.join(os.tmpdir(),'obfs-private-class-frame-'));
  try {
    const preload=path.join(directory,'preload.cjs');
    const runner=path.join(directory,'runner.cjs');
    const target=path.join(directory,'target.cjs');
    await writeFile(preload,
      "const nativeIsArray=Array.isArray;\n"+
      "Array.isArray=function observedIsArray(value){\n"+
      "  if(globalThis.__obfsPrivateClassArmed){\n"+
      "    globalThis.__obfsPrivateClassStack=new Error().stack;\n"+
      "  }\n"+
      "  return nativeIsArray(value);\n"+
      "};\n",'utf8');
    await writeFile(runner,
      "globalThis.__obfsPrivateClassArmed=false;\n"+
      "globalThis.__obfsPrivateClassStack=null;\n"+
      "const value=require(process.argv[2]);\n"+
      "process.stdout.write(JSON.stringify({value,stack:globalThis.__obfsPrivateClassStack}));\n",
      'utf8');
    await writeFile(target,source,'utf8');
    const child=spawnSync(process.execPath,['-r',preload,runner,target],{
      encoding:'utf8',timeout:10000
    });
    assert.equal(child.error,undefined);
    assert.equal(child.status,0,child.stderr);
    const parsed=/** @type {{value:number,stack:string|null}} */ (JSON.parse(child.stdout));
    assert.ok(parsed.stack,'the host callback must capture an Error stack');
    const frame=parsed.stack.split('\n').find(line=>line.includes('target.cjs'));
    assert.ok(frame,'the stack must include the target CommonJS wrapper frame: '+parsed.stack);
    const match=frame.match(/target\.cjs:(\d+):(\d+)\)?$/);
    assert.ok(match,'the target frame must expose line and column: '+frame);
    return {value:parsed.value,line:Number(match[1]),column:Number(match[2]),frame};
  } finally {
    await rm(directory,{recursive:true,force:true});
  }
}

for(const mode of /** @type {Array<'coo'|'sno'>} */ (['coo','sno','sco'])) {
  test(mode+' strict private class must preserve caller FramePosition after a host callback',async()=>{
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
      mode,closedWorld:true,seed:'private-class-frame-position/'+mode,
      properties:true,identifiers:false,strings:false
    });
    const native=await observeFrame(source);
    const emitted=await observeFrame(String(output.files[0].code));
    assert.equal(native.value,7);
    assert.equal(emitted.value,7);
    assert.equal(emitted.line,native.line);
    assert.equal(emitted.column,native.column,
      'A source rewrite must not move the host-observed strict wrapper frame; '+
      'property rewrites='+output.files[0].metrics.properties+
      ', native='+native.frame+', emitted='+emitted.frame);
  });
}
