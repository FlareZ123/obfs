'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parse}=require('../src/ast');
const {firstUnprovedFreeReference}=require('../src/sco-free-references');

test('wide lexical scope inventories its declarations once, preserving proven reads',()=>{
  const width=256;
  const declarations=Array.from({length:width},(_,index)=>
    'const k'+index+'='+index+';').join('');
  const references=Array.from({length:width},(_,index)=>
    'void k'+index+';').join('');
  const parsed=parse('export async function protectedOp(){'+
    declarations+references+'}','module');
  const root=parsed.body[0].declaration.body;
  let indexedReads=0;
  const statements=root.body;
  root.body=new Proxy(statements,{
    get(target,property,receiver){
      if(typeof property==='string'&&/^(?:0|[1-9][0-9]*)$/u.test(property)){
        indexedReads++;
      }
      return Reflect.get(target,property,receiver);
    }
  });
  assert.equal(firstUnprovedFreeReference(root,new Set(),new Set(),
    new Set(),true),null);
  assert.ok(indexedReads<20*width,
    'Lexical scope declarations must be inventoried once: '+indexedReads+
    ' numeric body reads for '+width+' owned declarations and references');
});
