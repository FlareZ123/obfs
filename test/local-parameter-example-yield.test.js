'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {analyzeSource,main}=require('../sims/local-parameter-example-yield');

test('grammar candidate scan detects a direct simple formal without treating destructuring as owner literals',()=>{
  const positive='function calculate(payload){const owner={secretField:payload,bias:3};'+
    'return owner.secretField+owner.bias;}';
  assert.deepEqual(analyzeSource(positive,'script','synthetic'),{
    syntax:1,direct:1,shorthandSyntax:0,shorthandDirect:0,
    candidates:[{path:'synthetic',ownerLine:1,value:'payload',key:'secretField',shorthand:false}]
  });
  const shorthand='function calculate(payload){const owner={payload,bias:3};'+
    'return owner.payload+owner.bias;}';
  assert.deepEqual(analyzeSource(shorthand,'script','synthetic'),{
    syntax:1,direct:1,shorthandSyntax:1,shorthandDirect:1,
    candidates:[{path:'synthetic',ownerLine:1,value:'payload',key:'payload',shorthand:true}]
  });
  const negative='function calculate(payload){const owner={secretField:()=>payload};'+
    'const {secretField:value}=owner;return value();}';
  const result=analyzeSource(negative,'script','synthetic');
  assert.equal(result.syntax,0);
  assert.equal(result.direct,0);
});

test('frozen source examples have reproducible AST grammar coverage, excluding emitted artifacts',async()=>{
  const result=await main();
  assert.ok(result.sourceFiles>=40,'Expected frozen original/native example coverage');
  assert.ok(result.directConstOwners<=result.syntaxParameterValues);
  assert.ok(result.directConstShorthandOwners<=result.syntaxShorthandParameterValues);
  assert.ok(result.directConstShorthandOwners<=result.directConstOwners);
  assert.equal(result.candidates.length,result.directConstOwners);
});
