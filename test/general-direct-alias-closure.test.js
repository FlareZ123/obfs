'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {obfuscateFiles}=require('../src');

/** @param {string} source @returns {{code:string,renames:number}} */
function compile(source) {
  const emitted=obfuscateFiles([{path:'rich-alias.cjs',code:source,sourceType:'commonjs'}],{
    mode:'coo',seed:'general-alias-queue-equivalence',strings:false,identifiers:false
  });
  return {
    code:/** @type {string} */ (emitted.files[0].code),
    renames:emitted.files[0].metrics.properties
  };
}

/** @param {string} source @returns {unknown} */
function run(source) {
  /** @type {{exports:unknown}} */
  const module={exports:null};
  new Function('module',source)(module);
  return module.exports;
}

/** @param {string} source @param {number} expected */
function equivalent(source,expected) {
  const result=compile(source);
  assert.equal(result.renames,expected,result.code);
  assert.deepEqual(run(result.code),run(source));
}

test('unrelated verified function preserves 128 direct owner alias rewrites',()=>{
  let code="'use strict';function unrelated(){return 3;}let sum=unrelated();\n";
  for(let i=0;i<128;i++)
    code+='const bag'+i+'={secret:'+(i%13)+'};'+
      'const alias'+i+'=bag'+i+';const final'+i+'=alias'+i+';'+
      'sum=(sum+final'+i+'.secret)|0;\n';
  equivalent(code+'module.exports=sum;',128);
});

test('private tuple and record owner carriers close into direct alias chains',()=>{
  equivalent(`'use strict';
    function unused(){return 9;}
    const first={secret:11};const tuple=[0,first,3];
    const fromTuple=tuple[1];const nextTuple=fromTuple;const lastTuple=nextTuple;
    const second={secret:17};const holder={tag:0,owned:second};
    const fromRecord=holder.owned;const nextRecord=fromRecord;const lastRecord=nextRecord;
    module.exports=unused()+lastTuple.secret+lastRecord.secret;
  `,2);
});

test('distinct local identity functions retain own rewrite coverage',()=>{
  let code="'use strict';let total=0;\n";
  for(let i=0;i<48;i++)
    code+='const bag'+i+'={secret:'+(i%11)+'};'+
      'const alias'+i+'=bag'+i+';'+
      'const id'+i+'=(input'+i+')=>input'+i+';'+
      'const returned'+i+'=id'+i+'(alias'+i+');'+
      'total=(total+returned'+i+'.secret)|0;\n';
  equivalent(code+'module.exports=total;',48);
});

test('reflection keeps escaped shape while another rich-graph owner rewrites',()=>{
  equivalent(`'use strict';
    function unrelated(){return 4;}
    const escaped={secret:7};const exposed=escaped;
    const observed=Object.keys(exposed)[0];
    const privateOwner={secret:5};const first=privateOwner;const second=first;
    module.exports=[observed,second.secret+unrelated()];
  `,1);
});

test('96 deterministic callable-rich private-owner graphs preserve original outputs',()=>{
  for(let i=0;i<96;i++){
    const owner=i%4;
    const hops=1+(i%13);
    let source="'use strict';function unrelated(){return "+(i%17)+";}"+
      'const privateOwner={secret:'+(i%31)+'};';
    switch(owner){
      case 0:source+='const alias0=privateOwner;';break;
      case 1:source+='const holder=[0,privateOwner,3];const alias0=holder[1];';break;
      case 2:source+='const holder={tag:0,owned:privateOwner};const alias0=holder.owned;';break;
      default:source+='const identity=(value)=>value;const alias0=identity(privateOwner);';
    }
    for(let j=1;j<=hops;j++)source+='const alias'+j+'=alias'+(j-1)+';';
    source+='const exported={secret:'+(i%19)+'};const view=exported;'+
      'const key=Object.keys(view)[0];'+
      'module.exports=[alias'+hops+'.secret,key,unrelated()];';
    equivalent(source,1);
  }
});
