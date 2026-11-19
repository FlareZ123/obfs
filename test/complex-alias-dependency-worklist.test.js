'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {obfuscateFiles}=require('../src');

/** @param {string} source @returns {{code:string,renames:number}} */
function compile(source) {
  const emitted=obfuscateFiles([{path:'dependency-worklist.cjs',code:source,sourceType:'commonjs'}],{
    mode:'coo',seed:'complex-alias-dependency-worklist',strings:false,identifiers:false
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
  const emitted=compile(source);
  assert.equal(emitted.renames,expected,emitted.code);
  assert.deepEqual(run(emitted.code),run(source));
}

test('96 reverse-ordered formal dependencies reach the same private owner',()=>{
  const depth=96;
  let source="'use strict';let total=0;\n";
  for(let i=depth;i>=0;i--){
    if(i===depth)source+='function f'+i+'(p'+i+'){total=(total+p'+i+'.secret)|0;}\n';
    else source+='function f'+i+'(p'+i+'){f'+(i+1)+'(p'+i+');}\n';
  }
  source+='const root={secret:37};f0(root);module.exports=total;\n';
  equivalent(source,1);
});

test('every call site must resolve before a formal can observe a private field',()=>{
  equivalent(`'use strict';
    function read(value){return value.secret;}
    const first={secret:11};const alias=first;
    module.exports=[read(first),read(alias),read(7)];
  `,0);
});

test('all proven call sites admit the formal and its owner field',()=>{
  equivalent(`'use strict';
    function read(value){return value.secret;}
    const owner={secret:13};const alias=owner;
    module.exports=[read(owner),read(alias)];
  `,1);
});

test('tuple and record carrier aliases trigger dependent formal chains',()=>{
  equivalent(`'use strict';let total=0;
    function sink(value){total=(total+value.secret)|0;}
    function mid(value){sink(value);}
    const first={secret:17};const tuple=[0,first,3];
    const tupleOwner=tuple[1];mid(tupleOwner);
    const second={secret:19};const record={tag:0,owned:second};
    const recordOwner=record.owned;mid(recordOwner);
    module.exports=total;
  `,2);
});

test('unseeded formal cycle does not manufacture an owner proof',()=>{
  equivalent(`'use strict';
    function left(value){if(false)right(value);}
    function right(value){if(false)left(value);return value.secret;}
    const owner={secret:23};
    module.exports=[Object.keys(owner)[0],right(5)];
  `,0);
});

test('reflection refusal remains isolated from an independent proved owner',()=>{
  equivalent(`'use strict';
    function read(value){return value.secret;}
    const escaped={secret:29};const view=escaped;
    const observed=Object.keys(view)[0];
    const privateOwner={secret:31};const alias=privateOwner;
    module.exports=[observed,read(alias)];
  `,1);
});
