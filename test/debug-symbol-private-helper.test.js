'use strict';

const {test}=require('node:test');
const fs=require('node:fs/promises');
const path=require('node:path');
const {parse}=require('../src/ast');
const {collectBindings,proveLocalObject}=require('../src/properties');
const {symbolizeLocalProperties}=require('../src/symbol-properties');

test('diagnose private Symbol helper proof',async()=>{
  const source=await fs.readFile(path.join(__dirname,'../examples/symbol-keys/before.cjs'),'utf8');
  const ast=parse(source,'commonjs');
  const bindings=collectBindings(ast);
  const proof=proveLocalObject(ast,'bag',bindings);
  process.stdout.write('SYMBOL_PROOF '+JSON.stringify(proof?{
    members:proof.members.map(m=>({start:m.start,end:m.end,computed:m.computed})),
    patterns:proof.patterns.length,inChecks:proof.inChecks.length,
    names:[...proof.memberNames.entries()].map(([m,n])=>[m.start,n])
  }:null)+'\n');
  const result=symbolizeLocalProperties(source,ast,{seed:'symbol-example-v1'});
  process.stdout.write('SYMBOL_RESULT '+JSON.stringify({objects:result.objects,properties:result.properties,code:result.code})+'\n');
});
