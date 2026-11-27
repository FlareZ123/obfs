'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {parse}=require('../src/ast');
const {firstUnprovedFreeReference}=require('../src/sco-free-references');

const sources=[
  '',
  'var x=5;',
  'let x=5;',
  'const x=5;',
  'if(false){var x=5;}',
  'if(true){var x=5;}',
  'if(false){let x=5;}',
  'if(true){let x=5;}',
  '{var x=5;}',
  '{const x=5;}',
  'switch(0){case 1:var x=5;}',
  'switch(0){case 1:let x=5;}',
  'class C{static {var x=5;}}',
  'function decoy(){var x=5;}',
  'try{throw 1;}catch(x){}',
  'for(var x of [5]){}',
  'for(let x of [5]){}',
  'for(const x of [5]){}'
];

const reads=[
  'return x;',
  'return String(x);',
  'return (()=>x)();',
  'function get(){return x;}return get();',
  'const get=()=>x;return get();',
  'return ({[x]:1})[String(x)];',
  'let z=0;if(z===1){z=x;}return x;',
  'const z={get v(){return x;}};return z.v;',
  'switch(x){case 5:let x=7;break;}return 3;',
  'switch(x){case 5:var x=7;break;}return 3;',
  'class Box{static value=x;}return Box.value;',
  'class Box{static {this.value=x;}}return Box.value;',
  'function read(value=x){return value;}return read();',
  'function read(value=()=>x){return value();}return read();',
  'for(let x of [x]){}return 3;',
  'for(var x of [x]){}return 3;',
  'return (async()=>x)();'
];

/** @type {Set<string>} */
const known=new Set(['String','Object','Array','undefined']);

/**
 * @param {string} body
 * @param {number} depth
 * @returns {string}
 */
function nested(body,depth){
  for(let i=0;i<depth;i++){
    body='function layer'+i+'(){'+body+'}return layer'+i+'();';
  }
  return body;
}

/**
 * Observe only primitive result or error name/message: cross-realm thrown
 * stack traces and constructors are intentionally excluded from this oracle.
 * @param {string} body
 * @param {boolean} withGlobal
 * @returns {Promise<string>}
 */
async function observed(body,withGlobal){
  const realm=withGlobal?{x:73}:{};
  try{
    const value=await vm.runInNewContext(
      '(async function(){"use strict";'+body+'})()',realm);
    return 'return '+typeof value+':'+String(value);
  }catch(error){
    if(error instanceof Error || error&&typeof error==='object'){
      const issue=/** @type {{name?:string,message?:string}} */(error);
      return 'throw '+issue.name+':'+issue.message;
    }
    return 'throw '+String(error);
  }
}

test('generated strict native-realm corpus falsifies local-name soundness',async()=>{
  let valid=0;
  let invalid=0;
  let proven=0;
  let refused=0;
  let externalSensitivity=0;
  for(const prefix of sources){
    for(const suffix of reads){
      for(const depth of [0,1,3]){
        const body=nested(prefix+suffix,depth);
        /** @type {import('../src/ast').AstNode} */
        let root;
        try{
          root=parse('export async function protectedOp(){'+body+'}','module')
            .body[0].declaration.body;
        }catch(error){
          if(!(error instanceof SyntaxError))throw error;
          invalid++;
          continue;
        }
        valid++;
        const free=firstUnprovedFreeReference(root,new Set(),new Set(),known,true);
        const absent=await observed(body,false);
        const supplied=await observed(body,true);
        if(absent!==supplied){
          externalSensitivity++;
          assert.notEqual(free,null,
            'Unsafe source admitted despite global sensitivity: '+body+
            '\nabsent='+absent+'\nsupplied='+supplied);
        }
        if(free===null){
          proven++;
          assert.equal(absent,supplied,
            'Proved source must be insensitive to external x: '+body);
        }else refused++;
      }
    }
  }
  assert.ok(valid>=750,'Corpus must retain broad valid grammar coverage: '+valid);
  assert.ok(invalid>0,'At least one conflicting declaration must be filtered');
  assert.ok(proven>=100,'Corpus must include independently proven local names');
  assert.ok(refused>=100,'Corpus must include distinct external-name refusals');
  assert.ok(externalSensitivity>=100,'Native oracle must exercise external globals');
});
