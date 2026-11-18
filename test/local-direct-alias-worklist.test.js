'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {obfuscateFiles}=require('../src');

/** @param {string} code @returns {unknown} */
function execute(code){
  /** @type {{exports:unknown}} */
  const module={exports:null};
  new Function('module',code)(module);
  return module.exports;
}

/** @param {string} source @returns {{code:string,renames:number}} */
function compile(source){
  const result=obfuscateFiles([{path:'alias.cjs',code:source,sourceType:'commonjs'}],{
    mode:'coo',seed:'direct-alias-proof-worklist',strings:false,identifiers:false
  });
  return {code:/** @type {string} */ (result.files[0].code),
    renames:result.files[0].metrics.properties};
}

test('function-free owner chains retain all 128 actual key rewrites',()=>{
  let source="'use strict';let total=0;\n";
  for(let i=0;i<128;i++){
    source+='const owner'+i+'={secret:'+(i%31)+'};'+
      'const alias'+i+'=owner'+i+';'+
      'const second'+i+'=alias'+i+';'+
      'total=(total+second'+i+'.secret)|0;\n';
  }
  source+='module.exports=total;\n';
  const result=compile(source);
  assert.equal(result.renames,128,result.code);
  assert.equal(execute(result.code),execute(source));
});

test('reflection of one owner retains its key while a distinct alias rewrites',()=>{
  const source="'use strict';"+
    'const exposed={secret:5};const exposedAlias=exposed;'+
    'const key=Object.keys(exposedAlias)[0];'+
    'const privateOwner={secret:7};const privateAlias=privateOwner;'+
    'module.exports=[key,privateAlias.secret];';
  const result=compile(source);
  assert.equal(result.renames,1,result.code);
  assert.deepEqual(execute(result.code),execute(source));
});
