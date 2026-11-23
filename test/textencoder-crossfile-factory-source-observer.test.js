'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');

const factory="module.exports=function make(){return new TextEncoder();};\n";
const app=
  "const make=require('./factory.cjs');\n"+
  "const encoder=make();\n"+
  "function observed(){return 'cross-file-encoder-source-literal';}\n"+
  "module.exports=Array.from(encoder.encode(observed));\n";

/**
 * Spawn the real CommonJS loader for a fixed two-file source graph, writing
 * each fixture via an exclusively-created name and same-directory rename.
 * @param {string} factoryCode
 * @param {string} appCode
 * @returns {string}
 */
function run(factoryCode,appCode) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-encoder-graph-'));
  try {
    /** @param {string} filename @param {string} content @returns {void} */
    const write=(filename,content)=>{
      const dest=path.join(dir,filename);
      const tmp=dest+'.pending';
      fs.writeFileSync(tmp,content,{flag:'wx'});
      fs.renameSync(tmp,dest);
    };
    write('factory.cjs',factoryCode);
    write('app.cjs',appCode);
    write('runner.cjs',
      "process.stdout.write(JSON.stringify(require('./app.cjs')));\n");
    return execFileSync(process.execPath,[path.join(dir,'runner.cjs')],
      {encoding:'utf8',timeout:10000});
  }finally{
    fs.rmSync(dir,{recursive:true,force:true});
  }
}

for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
  test('cross-file TextEncoder factory source coercion '+mode,()=>{
    const output=obfuscateFiles([
      {path:'factory.cjs',sourceType:'commonjs',code:factory},
      {path:'app.cjs',sourceType:'commonjs',code:app}
    ],{mode,seed:'encoder-interfile-factory/'+mode,
       strings:true,identifiers:false,properties:false}).files;
    const transformedFactory=output.find(f=>f.path==='factory.cjs');
    const transformedApp=output.find(f=>f.path==='app.cjs');
    assert.ok(transformedFactory&&transformedApp);
    assert.equal(run(String(transformedFactory.code),String(transformedApp.code)),
      run(factory,app),'Native Node loader must observe the original callable source bytes');
  });
}
