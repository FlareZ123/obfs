'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

/**
 * Use actual Node error templates, including their function names.
 * @param {string} source
 * @returns {{status:number|null,stdout:string,stderr:string}}
 */
function execute(source) {
  const child=spawnSync(process.execPath,['--eval',source],{
    encoding:'utf8',timeout:10000,windowsHide:true,maxBuffer:1024*1024
  });
  if(child.error)throw child.error;
  return {status:child.status,stdout:child.stdout,stderr:child.stderr};
}

/** @type {readonly [string,string][]} */
const cases=[
  ['Buffer.from function argument',"Buffer.from(function originalCallableInput(){return 'unobserved'});"],
  ['Buffer.byteLength function argument',"Buffer.byteLength(function originalCallableInput(){return 'unobserved'});"],
  ['Buffer.alloc function size',"Buffer.alloc(function originalCallableInput(){return 'unobserved'});"],
  ['global Buffer alias',"const Container=Buffer;Container.from(function originalCallableInput(){return 'unobserved'});"]
];

for(const mode of /** @type {const} */(['sno','coo','sco'])) {
  for(const [name,throwing] of cases) {
    test(mode+' preserves native Buffer rejected callable name: '+name,()=>{
      const source="'use strict';try{"+throwing+"}catch(error){"+
        "console.log(error.message);}";
      const emitted=obfuscateFiles([{
        path:'buffer.cjs',sourceType:'commonjs',code:source
      }],{mode,seed:'buffer-invalid-caller/'+mode+'/'+name,
        strings:false,identifiers:true,properties:false}).files[0];
      const native=execute(source);
      assert.equal(native.status,0);
      assert.match(native.stdout,/originalCallableInput/);
      assert.deepEqual(execute(String(emitted.code)),native);
    });
  }
  test(mode+' safe private numeric code retains identifier rename',()=>{
    const source="'use strict';const privateValue=32;console.log(privateValue+17);";
    assert.equal(observesFunctionSource(parse(source,'commonjs')),false);
    const emitted=obfuscateFiles([
      {path:'positive.cjs',sourceType:'commonjs',code:source}
    ],{mode,seed:'buffer-invalid-positive/'+mode,
      strings:false,identifiers:true,properties:false}).files[0];
    assert.deepEqual(execute(String(emitted.code)),execute(source));
    assert.ok(emitted.metrics.bindings>0);
  });
}
