'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {execFileSync}=require('node:child_process');
const {transformSync}=require('esbuild');
const {obfuscateFiles}=require('../src');

const source=
  "const get=Reflect.get;\n"+
  "function marker(){return 'unused-captured-native-source-marker';}\n"+
  "module.exports={answer:'protected-captured-host-literal',"+
  "read:get({known:2},'known')};\n";

/**
 * A real Node CJS preloader modifies the nominally native method before
 * the application module loads. Its sloppy wrapper reads the source of the
 * actual Node module caller. The method is defined exclusively by the host,
 * so the input compiler cannot infer this observer from the source text.
 *
 * @param {string} targetCode
 * @param {boolean} replaceHostMethod
 * @returns {string}
 */
function execute(targetCode,replaceHostMethod) {
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-host-minifier-'));
  try {
    fs.writeFileSync(path.join(folder,'target.cjs'),targetCode,'utf8');
    fs.writeFileSync(path.join(folder,'host.cjs'),
      replaceHostMethod?
        "const original=Reflect.get;\n"+
        "Reflect.get=function(target,key){\n"+
        " if(key==='known'&&target&&target.known===2)"+
        "return arguments.callee.caller.toString();\n"+
        " return original.apply(Reflect,arguments);\n"+
        "};\n":'','utf8');
    fs.writeFileSync(path.join(folder,'entry.cjs'),
      "process.stdout.write(JSON.stringify(require('./target.cjs')));\n",'utf8');
    return execFileSync(process.execPath,[
      '--require',path.join(folder,'host.cjs'),path.join(folder,'entry.cjs')
    ],{encoding:'utf8',timeout:10000});
  } finally {
    fs.rmSync(folder,{recursive:true,force:true});
  }
}

test('ordinary esbuild minification shares the mutable-host caller-source parity limitation',()=>{
  const compact=transformSync(source,{
    loader:'js',format:'cjs',target:'node22',minify:true
  }).code;
  assert.ok(compact.length<source.length,'Control actually changes source');
  assert.equal(execute(compact,false),execute(source,false),
    'The original and ordinary minifier agree under the native method');
  assert.notEqual(execute(compact,true),execute(source,true),
    'The host preloader can observe even ordinary minification');
});

for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
  test('compiled '+mode+' and ordinary source-minifier have the same bounded host limitation',()=>{
    const output=obfuscateFiles([
      {path:'target.cjs',sourceType:'commonjs',code:source}
    ],{
      mode,seed:'native-host-minifier-control/'+mode,
      strings:true,identifiers:false,properties:false
    }).files[0];
    assert.ok(output.metrics.literals>0,
      'The compiler actually encodes selected literals in this control');
    const transformed=String(output.code);
    assert.equal(execute(transformed,false),execute(source,false),
      'The unmodified native intrinsic preserves application behavior');
    assert.notEqual(execute(transformed,true),execute(source,true),
      'An external source-observing preloader distinguishes the emitted module');
  });
}
