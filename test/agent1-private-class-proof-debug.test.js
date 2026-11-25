'use strict';
const {test}=require('node:test');
const {parse}=require('../src/ast');
const {collectBindings,proveLocalObject,renameLocalProperties}=require('../src/properties');

test('debug private class proof',()=>{
 const source="'use strict';const owner={privateField:7};class Reader{read(){return owner.privateField;}}const reader=new Reader();module.exports=reader.read();";
 const ast=parse(source,'commonjs');
 const bindings=collectBindings(ast);
 const proof=proveLocalObject(ast,'owner',bindings);
 const renamed=renameLocalProperties(source,ast,{seed:'private-class-source-yield/coo'});
 console.log('AGENT1_PRIVATE_CLASS_PROOF '+JSON.stringify({
   bindingCount:bindings.get('owner'),
   proof:proof&&{
     members:proof.members.length,
     patterns:proof.patterns.length,
     inChecks:proof.inChecks.length,
     names:proof.members.map(member=>({
       type:member.type,
       propertyType:member.property.type,
       propertyName:member.property.name,
       computed:member.computed,
       text:source.slice(member.property.start,member.property.end),
       mapped:proof.memberNames.get(member)
     }))
   },
   renamed:{objects:renamed.objects,properties:renamed.properties,code:renamed.code}
 }));
});
