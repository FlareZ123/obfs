'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {parse,observesFunctionSource,observesDistributedSource}=require('../src/ast');
const {renameLocalProperties}=require('../src/properties');
const {obfuscateFiles}=require('../src');

/** @type {ReadonlyArray<{label:string,kind:'module'|'commonjs',source:string}>} */
const fixtures=[
  {label:'direct-primitive',kind:'commonjs',source:
    "'use strict';const owner={privateField:7};module.exports=owner.privateField;"},
  {label:'private-local-method',kind:'commonjs',source:
    "'use strict';const owner={privateField:7};const reader=()=>owner.privateField;module.exports=reader();"},
  {label:'private-class-reader',kind:'commonjs',source:
    "'use strict';const owner={privateField:7};class Reader{read(){return owner.privateField;}}"+
    "const reader=new Reader();module.exports=reader.read();"},
  {label:'private-class-constructor',kind:'commonjs',source:
    "'use strict';const owner={privateField:7};class Reader{read(){return owner.privateField;}}"+
    "module.exports=new Reader().read();"},
  {label:'private-class-direct-call',kind:'commonjs',source:
    "'use strict';const owner={privateField:7};class Reader{read(){return owner.privateField;}}"+
    "module.exports=Reader.prototype.read.call(null);"},
  {label:'private-bound-export',kind:'module',source:
    'const owner={secretField:7,otherField:11};'+
    'const internal=(privateFirst,privateSecond)=>{'+
    'return ((privateFirst+owner.secretField)^owner.otherField)+privateSecond;};'+
    'export const hot=internal.bind(null);'},
  {label:'private-unbound-export',kind:'module',source:
    'const owner={secretField:7,otherField:11};'+
    'const internal=(privateFirst,privateSecond)=>{'+
    'return ((privateFirst+owner.secretField)^owner.otherField)+privateSecond;};'+
    'export const hot=internal;'},
  {label:'private-bound-internal',kind:'module',source:
    'const owner={secretField:7,otherField:11};'+
    'const internal=(privateFirst,privateSecond)=>{'+
    'return ((privateFirst+owner.secretField)^owner.otherField)+privateSecond;};'+
    'const hot=internal.bind(null);export const result=hot(1,2);'}
];

test('source-guard/private-owner proof diagnostic with positive controls',()=>{
  /** @type {Array<{label:string,sourceObservation:boolean,distributedObservation:boolean,directObjects:number,directProperties:number,coreObjects:number,coreProperties:number,crossProperties:number}>} */
  const findings=[];
  for(const fixture of fixtures){
    const ast=parse(fixture.source,fixture.kind);
    const direct=renameLocalProperties(fixture.source,ast,{seed:'agent9-direct/'+fixture.label});
    const compiled=obfuscateFiles([{
      path:fixture.kind==='module'?'entry.mjs':'entry.cjs',
      sourceType:fixture.kind,code:fixture.source
    }],{
      mode:'coo',closedWorld:true,properties:true,identifiers:false,
      strings:false,seed:'agent9-core/'+fixture.label
    });
    const row={
      label:fixture.label,
      sourceObservation:observesFunctionSource(ast),
      distributedObservation:observesDistributedSource(ast),
      directObjects:direct.objects,
      directProperties:direct.properties,
      coreObjects:compiled.files[0].metrics.objects,
      coreProperties:compiled.files[0].metrics.properties,
      crossProperties:compiled.crossFile.properties
    };
    findings.push(row);
    assert.equal(typeof row.sourceObservation,'boolean');
    assert.equal(typeof row.directProperties,'number');
    assert.equal(typeof row.coreProperties,'number');
  }
  console.log('AGENT9_SOURCE_YIELD_DIAGNOSTIC '+JSON.stringify(findings));
  assert.ok(findings.some(row=>row.label==='direct-primitive'&&row.coreProperties>0),
    'The simple own-primitive positive control must remain transformable');
});
