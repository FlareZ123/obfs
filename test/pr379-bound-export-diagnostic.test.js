'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource,observesDistributedSource}=require('../src/ast');
const {renameLocalProperties,collectBindings,proveLocalObject}=require('../src/properties');

const boundSource='const owner={secretField:7,otherField:11};'+
  'const internal=(privateFirst,privateSecond)=>'+
  '((privateFirst+owner.secretField)^owner.otherField)+privateSecond;'+
  'export const hot=internal.bind(null);';
const directSource='const owner={secretField:7,otherField:11};'+
  'export function hot(privateFirst,privateSecond){'+
  'return ((privateFirst+owner.secretField)^owner.otherField)+privateSecond;}';

test('diagnose bound public export source-observer versus local-proof refusal',()=>{
  const reports=[];
  for(const [label,source] of [['bound',boundSource],['direct',directSource]]) {
    const ast=parse(source,'module');
    const bindings=collectBindings(ast);
    const proof=proveLocalObject(ast,'owner',bindings);
    const local=renameLocalProperties(source,ast,{seed:'bound-export-diagnostic'});
    const full=obfuscateFiles([{path:'entry.mjs',sourceType:'module',code:source}],{
      mode:'coo',closedWorld:true,seed:'bound-export-diagnostic',
      properties:true,identifiers:false,strings:false
    });
    reports.push({
      label,
      observesFunctionSource:observesFunctionSource(ast),
      observesDistributedSource:observesDistributedSource(ast),
      localProperties:local.properties,
      localObjects:local.objects,
      proof:proof?{
        members:proof.members.length,
        patterns:proof.patterns.length,
        inChecks:proof.inChecks.length
      }:null,
      fullProperties:full.files[0].metrics.properties,
      crossProperties:full.crossFile.properties
    });
  }
  assert.fail('BOUND_EXPORT_DIAGNOSTIC '+JSON.stringify(reports));
});
