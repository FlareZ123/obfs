'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');

/**
 * Node permits a non-strict CommonJS callee to read its calling function via
 * Function#caller. The function does not need to escape by name or object
 * reference for its exact source to be externally observable.
 * @type {string}
 */
const observer=[
  'function inspectCaller(){',
  '  return Function.prototype.toString.call(inspectCaller.caller);',
  '}',
  'module.exports=inspectCaller;'
].join('\n');

const observedEntry=[
  "const inspectCaller=require('./observer.cjs');",
  'function compute(){',
  '  const state={secretField:17,bonusField:5};',
  '  return [state.secretField+state.bonusField,inspectCaller()];',
  '}',
  'process.stdout.write(JSON.stringify(compute()));'
].join('\n');

const getterObserver=[
  'function inspectGetterCaller(){',
  '  return Function.prototype.toString.call(inspectGetterCaller.caller);',
  '}',
  "Object.defineProperty(exports,'text',{get:inspectGetterCaller});"
].join('\n');

const getterEntry=[
  "const foreign=require('./observer.cjs');",
  'function compute(){',
  '  const state={secretField:17,bonusField:5};',
  '  return [state.secretField+state.bonusField,foreign.text];',
  '}',
  'process.stdout.write(JSON.stringify(compute()));'
].join('\n');

const strictObserver=[
  'function inspectCaller(){',
  '  try{return Function.prototype.toString.call(inspectCaller.caller);}',
  '  catch(error){return error.name;}',
  '}',
  'module.exports=inspectCaller;'
].join('\n');

const strictEntry=[
  "'use strict';",
  "const inspectCaller=require('./observer.cjs');",
  'function compute(){',
  '  const state={secretField:17,bonusField:5};',
  '  return [state.secretField+state.bonusField,inspectCaller()];',
  '}',
  'process.stdout.write(JSON.stringify(compute()));'
].join('\n');

const privateEntry=[
  'function compute(){',
  '  const state={secretField:17,bonusField:5};',
  '  return state.secretField+state.bonusField;',
  '}',
  'process.stdout.write(JSON.stringify(compute()));'
].join('\n');

/**
 * Execute an actual non-strict Node CommonJS graph, preserving native
 * Function#caller behavior rather than simulating it through a vm wrapper.
 * @param {string} dir
 * @param {string} entry
 * @param {string} [helper]
 * @returns {Promise<{status:number|null,stdout:string,stderr:string}>}
 */
async function run(dir,entry,helper){
  await fs.mkdir(dir,{recursive:true});
  await fs.writeFile(path.join(dir,'entry.cjs'),entry,'utf8');
  if(helper!==undefined)
    await fs.writeFile(path.join(dir,'observer.cjs'),helper,'utf8');
  const child=spawnSync(process.execPath,[path.join(dir,'entry.cjs')],{
    encoding:'utf8',windowsHide:true,timeout:10000,maxBuffer:1024*1024
  });
  if(child.error)throw child.error;
  return {status:child.status,stdout:child.stdout,stderr:child.stderr};
}

/** @param {string} code @returns {import('../src/core').SourceFile} */
const sourceFile=code=>({path:'entry.cjs',sourceType:'commonjs',code});

for(const bundled of [false,true]){
  test('non-strict CJS caller source parity / '+
    (bundled?'included helper':'unbundled helper'),async()=>{
    const input=bundled?
      [sourceFile(observedEntry),{path:'observer.cjs',sourceType:'commonjs',code:observer}]:
      [sourceFile(observedEntry)];
    const output=obfuscateFiles(input,{
      mode:'sno',seed:'cjs-caller-source-'+bundled,
      identifiers:false,strings:false,properties:true
    });
    const entry=output.files.find(file=>file.path==='entry.cjs');
    assert.ok(entry);
    const emittedObserver=output.files.find(file=>file.path==='observer.cjs');
    const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-cjs-caller-source-'));
    try{
      const native=await run(path.join(root,'native'),observedEntry,observer);
      const protectedRun=await run(path.join(root,'output'),String(entry.code),
        emittedObserver?String(emittedObserver.code):observer);
      assert.equal(native.status,0,native.stderr);
      assert.equal(protectedRun.status,0,protectedRun.stderr);
      assert.deepEqual(protectedRun,native,
        'A direct-call-only private function may still be source-visible through a called sloppy CommonJS helper');
    }finally{
      await fs.rm(root,{recursive:true,force:true});
    }
  });
}

for(const bundled of [false,true]){
  test('non-strict CJS accessor getter caller source parity / '+
    (bundled?'included helper':'unbundled helper'),async()=>{
    const input=bundled?
      [sourceFile(getterEntry),{path:'observer.cjs',sourceType:'commonjs',code:getterObserver}]:
      [sourceFile(getterEntry)];
    const output=obfuscateFiles(input,{
      mode:'sno',seed:'cjs-getter-caller-source-'+bundled,
      identifiers:false,strings:false,properties:true
    });
    const entry=output.files.find(file=>file.path==='entry.cjs');
    assert.ok(entry);
    const emittedObserver=output.files.find(file=>file.path==='observer.cjs');
    const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-cjs-getter-caller-'));
    try{
      const native=await run(path.join(root,'native'),getterEntry,getterObserver);
      const protectedRun=await run(path.join(root,'output'),String(entry.code),
        emittedObserver?String(emittedObserver.code):getterObserver);
      assert.equal(native.status,0,native.stderr);
      assert.equal(protectedRun.status,0,protectedRun.stderr);
      assert.deepEqual(protectedRun,native,
        'A property getter in a separate module can inspect its non-strict calling function');
    }finally{
      await fs.rm(root,{recursive:true,force:true});
    }
  });
}

test('strict CJS function with foreign helper preserves private rename yield',async()=>{
  const output=obfuscateFiles([sourceFile(strictEntry)],{
    mode:'sno',seed:'cjs-caller-strict-positive',
    identifiers:false,strings:false,properties:true
  });
  assert.equal(output.files[0].metrics.properties,2,String(output.files[0].code));
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-cjs-caller-strict-'));
  try{
    const native=await run(path.join(root,'native'),strictEntry,strictObserver);
    const protectedRun=await run(path.join(root,'output'),String(output.files[0].code),strictObserver);
    assert.equal(native.status,0,native.stderr);
    assert.deepEqual(protectedRun,native);
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
});

test('non-observing private CJS reader still renames two own fields',async()=>{
  const output=obfuscateFiles([sourceFile(privateEntry)],{
    mode:'sno',seed:'cjs-caller-private-positive',
    identifiers:false,strings:false,properties:true
  });
  assert.equal(output.files[0].metrics.properties,2,String(output.files[0].code));
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-cjs-caller-safe-'));
  try{
    const native=await run(path.join(root,'native'),privateEntry);
    const protectedRun=await run(path.join(root,'output'),String(output.files[0].code));
    assert.equal(native.status,0,native.stderr);
    assert.deepEqual(protectedRun,native);
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
});
