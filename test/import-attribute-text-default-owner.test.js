'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');

const options={
  mode:'coo',
  closedWorld:true,
  strings:false,
  identifiers:false,
  seed:'import-attribute-text-default-owner'
};

function textImportFiles() {
  return [
    {path:'state.mjs',sourceType:'module',code:'export default {length:23};'},
    {path:'main.mjs',sourceType:'module',
      code:'import source from "./state.mjs" with {type:"text"};console.log(source.length);'}
  ];
}

test('ordinary default JavaScript import remains a positive owner-proof control',()=>{
  const files=[
    {path:'state.mjs',sourceType:'module',code:'export default {length:23};'},
    {path:'main.mjs',sourceType:'module',
      code:'import source from "./state.mjs";console.log(source.length);'}
  ];
  const output=obfuscateFiles(files,options);
  assert.equal(output.crossFile.properties,1);
  assert.notEqual(output.files.find(file=>file.path==='state.mjs').code,files[0].code);
});

test('browser text import is refused by the main obfuscation pipeline',()=>{
  const files=textImportFiles();
  const output=obfuscateFiles(files,options);
  assert.equal(output.crossFile.properties,0);
  assert.equal(output.files.find(file=>file.path==='state.mjs').code,files[0].code);
});

test('the direct cross-file proof refuses attributed default-import edges',()=>{
  const {renameCrossFileProperties}=require('../src/cross-properties');
  const files=textImportFiles();
  const result=renameCrossFileProperties(files,'attribute-direct-proof');
  assert.equal(result.properties,0);
  assert.equal(result.files.find(file=>file.path==='state.mjs').code,files[0].code);
});

test('host locking refuses a module group with an attributed source-observer edge',()=>{
  assert.throws(()=>obfuscateFiles(textImportFiles(),{...options,allowedHosts:['example.com']}),
    /Host locking cannot preserve observable source bytes/);
});

test('text re-exports refuse source transformations',()=>{
  const files=[
    {path:'state.mjs',sourceType:'module',
      code:'const privateValue=23;export default {length:privateValue};'},
    {path:'relay.mjs',sourceType:'module',
      code:'export {default as source} from "./state.mjs" with {type:"text"};'},
    {path:'main.mjs',sourceType:'module',
      code:'import {source} from "./relay.mjs";console.log(source.length);'}
  ];
  const output=obfuscateFiles(files,{...options,properties:false,identifiers:true});
  assert.equal(output.crossFile.properties,0);
  assert.equal(output.files.find(file=>file.path==='state.mjs').code,files[0].code);
});

test('dynamic import attributes also refuse source transformations',()=>{
  const files=[
    {path:'state.mjs',sourceType:'module',
      code:'const privateValue=23;export default {length:privateValue};'},
    {path:'main.mjs',sourceType:'module',
      code:'const loaded=await import("./state.mjs",{with:{type:"text"}});console.log(loaded.default.length);'}
  ];
  const output=obfuscateFiles(files,{...options,properties:false,identifiers:true});
  assert.equal(output.crossFile.properties,0);
  assert.equal(output.files.find(file=>file.path==='state.mjs').code,files[0].code);
});
