'use strict';

const assert=require('node:assert/strict');
const {mkdtemp,rm}=require('node:fs/promises');
const {tmpdir}=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const test=require('node:test');
const {atomicWrite}=require('../src/atomic');
const {obfuscateFiles}=require('../src');

/**
 * Node CommonJS source executes within the module loader's wrapper function.
 * In non-strict CommonJS, top-level arguments.callee can expose that wrapper's
 * exact source, including every otherwise private class or object method.
 */
const source=[
  'const owner={privateField:7};',
  'class Reader{read(){return owner.privateField;}}',
  'const reader=new Reader();',
  'module.exports={value:reader.read(),wrapper:arguments.callee.toString()};'
].join('');

/**
 * @param {string} filename
 * @returns {{value:number,wrapper:string}}
 */
function observe(filename) {
  const child=spawnSync(process.execPath,['-e',
    'const result=require(process.argv[1]);process.stdout.write(JSON.stringify(result));',
    filename
  ],{encoding:'utf8',timeout:10000});
  assert.ifError(child.error);
  assert.equal(child.status,0,child.stderr);
  return /** @type {{value:number,wrapper:string}} */ (JSON.parse(child.stdout));
}

for(const mode of /** @type {Array<'coo'|'sno'>} */ (['coo','sno'])){
  test(mode+' authentic Node CommonJS wrapper self-source survives private field rewriting',
    async()=>{
      const output=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:source}],{
        mode,seed:'cjs-wrapper-self-observer/'+mode,
        properties:true,identifiers:false,strings:false
      }).files[0];
      const directory=await mkdtemp(path.join(tmpdir(),'obfs-cjs-wrapper-observer-'));
      try{
        const nativePath=path.join(directory,'original.cjs');
        const emittedPath=path.join(directory,'emitted.cjs');
        await atomicWrite(nativePath,source);
        await atomicWrite(emittedPath,/** @type {string} */ (output.code));
        const native=observe(nativePath);
        const emitted=observe(emittedPath);
        assert.equal(native.value,7);
        assert.equal(emitted.value,native.value);
        assert.equal(emitted.wrapper,native.wrapper,
          JSON.stringify({mode,properties:output.metrics.properties,
            native:native.wrapper,emitted:emitted.wrapper},null,2));
      }finally{
        await rm(directory,{recursive:true,force:true});
      }
    }
  );
}
