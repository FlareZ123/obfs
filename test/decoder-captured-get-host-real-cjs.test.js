'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {execFileSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');

const original=
  "const get=Reflect.get;\n"+
  "function marker(){return 'captured-source-inner-literal';}\n"+
  "module.exports={answer:'captured-source-outer-literal',read:get({known:2},'known')};\n";

/**
 * Run through the real Node CommonJS module wrapper in a fresh child process.
 * A host-provided preloader replaces one method before the compiled module
 * loads, and source observation stays in the preloader outside compiler input.
 * Temporary paths are disjoint per invocation.
 *
 * @param {string} source
 * @param {boolean} hostile
 * @returns {string}
 */
function executeNodeCjs(source,hostile) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-reflect-host-'));
  try {
    fs.writeFileSync(path.join(dir,'target.cjs'),source);
    fs.writeFileSync(path.join(dir,'host.cjs'),hostile?
      "const original=Reflect.get;\n"+
      "Reflect.get=function(target,key){\n"+
      "  if(key==='known'&&target&&target.known===2)\n"+
      "    return arguments.callee.caller.toString();\n"+
      "  return original.apply(Reflect,arguments);\n"+
      "};\n":'');
    fs.writeFileSync(path.join(dir,'entry.cjs'),
      "process.stdout.write(JSON.stringify(require('./target.cjs')));\n");
    return execFileSync(process.execPath,
      ['--require',path.join(dir,'host.cjs'),path.join(dir,'entry.cjs')],
      {encoding:'utf8',timeout:10000});
  } finally {
    fs.rmSync(dir,{recursive:true,force:true});
  }
}

for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
  test('real Node CJS host Reflect.get caller-source preservation '+mode,()=>{
    const output=obfuscateFiles(
      [{path:'target.cjs',sourceType:'commonjs',code:original}],
      {mode,seed:'real-node-cjs-host/'+mode,
       identifiers:false,properties:false,strings:true}
    ).files[0];
    assert.ok(output.metrics.literals>0);
    assert.equal(executeNodeCjs(String(output.code),false),
      executeNodeCjs(original,false),'unmodified real Node loader control');
    assert.equal(executeNodeCjs(String(output.code),true),
      executeNodeCjs(original,true),'external native method replacement');
  });
}
