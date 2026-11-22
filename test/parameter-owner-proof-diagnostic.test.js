'use strict';
const test=require('node:test');
const {parse,walk,observesFunctionSource}=require('../src/ast.js');
const {collectBindings,collectPrivateDirectCallables,collectSourceExposedBodies,proveLocalObject,renameLocalProperties}=require('../src/properties.js');

test('diagnose parameter-owner proof stages',()=>{
  const variants=[
    ['bare','function compute(payload){const owner={secretField:payload};return owner.secretField;} compute(39);'],
    ['strict','function compute(payload){const owner={secretField:payload};return owner.secretField;} if(compute(39)!==39)throw new Error("bad");'],
    ['dom','function compute(payload){const owner={secretField:payload};return owner.secretField;} document.getElementById("answer").textContent=compute(39);']
  ];
  for(const [label,source] of variants){
    const ast=parse(source,'module');
    const bindings=collectBindings(ast);
    let fn=null;
    walk(ast,node=>{if(node.type==='FunctionDeclaration'&&node.id?.name==='compute')fn=node;});
    const privateCallables=collectPrivateDirectCallables(ast,bindings);
    const exposed=collectSourceExposedBodies(ast,bindings,'module');
    const proof=proveLocalObject(ast,'owner',bindings);
    const transformed=renameLocalProperties(source,ast,{seed:'diagnostic',sourceType:'module'});
    console.log(JSON.stringify({
      label,observer:observesFunctionSource(ast),computeBinding:bindings.get('compute'),
      ownerBinding:bindings.get('owner'),payloadBinding:bindings.get('payload'),
      privateCompute:privateCallables.has(fn),exposedCompute:exposed.has(fn),
      proof:proof?{members:proof.members.length,patterns:proof.patterns.length,inChecks:proof.inChecks.length}:null,
      metrics:{objects:transformed.objects,properties:transformed.properties}
    }));
  }
});
