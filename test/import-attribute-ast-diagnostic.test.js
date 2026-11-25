'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {parse,observesDistributedSource}=require('../src/ast');
const {obfuscateFiles}=require('../src');

test('Acorn AST exposes static import attributes and source-observer analysis refuses them',()=>{
  const ast=parse('import source from "./state.mjs" with {type:"text"};','module');
  const declaration=ast.body[0];
  assert.equal(declaration.type,'ImportDeclaration');
  assert.equal(Array.isArray(declaration.attributes),true,
    'Acorn should expose static import attributes as an array');
  assert.equal(declaration.attributes.length,1);
  assert.equal(observesDistributedSource(ast),true,
    'a text module observes the imported source bytes');
  const files=[
    {path:'state.mjs',sourceType:'module',code:'export default {length:23};'},
    {path:'main.mjs',sourceType:'module',
      code:'import source from "./state.mjs" with {type:"text"};export const value=source.length??-1;'}
  ];
  const output=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,strings:false,identifiers:false,
    seed:'import-attribute-ast-diagnostic'
  });
  assert.equal(output.crossFile.properties,0);
  assert.equal(output.files.find(file=>file.path==='state.mjs').metrics.properties,0,
    'local property rewriting must also be suppressed when imported as text');
});

test('dynamic import options are source observers',()=>{
  const ast=parse('const loaded=await import("./state.mjs",{with:{type:"text"}});','module');
  assert.equal(observesDistributedSource(ast),true);
});
