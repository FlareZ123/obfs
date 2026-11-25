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

test('the direct cross-file proof refuses attributed default-import edges',()=>{
  const {renameCrossFileProperties}=require('../src/cross-properties');
  const files=[
    {path:'state.mjs',sourceType:'module',code:'export default {length:23};'},
    {path:'main.mjs',sourceType:'module',
      code:'import source from "./state.mjs" with {type:"text"};console.log(source.length);'}
  ];
  const result=renameCrossFileProperties(files,'attribute-direct-proof');
  assert.equal(result.properties,0);
  assert.equal(result.files.find(file=>file.path==='state.mjs').code,files[0].code);
});

test('host locking refuses a module group with an attributed source-observer edge',()=>{
  const files=[
    {path:'state.mjs',sourceType:'module',code:'export default {length:23};'},
    {path:'main.mjs',sourceType:'module',
      code:'import source from "./state.mjs" with {type:"text"};console.log(source.length);'}
  ];
  assert.throws(()=>obfuscateFiles(files,{...options,allowedHosts:['example.com']}),
    /Host locking cannot preserve observable source bytes/);
});

test('browser text import is not treated as the JavaScript default object binding',()=>{
  // HTML import attributes define a distinct text module request. In browsers,
  // this import receives the source bytes as a string, not state.mjs's default
  // object. Renaming source.length as though it were the object field changes
  // String#length and also changes the source text observed by the text module.
  const files=[
    {path:'state.mjs',sourceType:'module',code:'export default {length:23};'},
    {path:'main.mjs',sourceType:'module',
      code:'import source from "./state.mjs" with {type:"text"};console.log(source.length);'}
  ];
  const output=obfuscateFiles(files,options);
  assert.equal(output.crossFile.properties,0,
    'A text-module import must not be merged with the JavaScript default export');
  assert.equal(output.files.find(file=>file.path==='state.mjs').code,files[0].code,
    'The source bytes observed by a text import must remain unchanged');
});

  // HTML import attributes define a distinct text module request. In browsers,
  // this import receives the source bytes as a string, not state.mjs's default
  // object. Renaming source.length as though it were the object field changes
  // String#length and also changes the source text observed by the text module.
  const files=[
    {path:'state.mjs',sourceType:'module',code:'export default {length:23};'},
    {path:'main.mjs',sourceType:'module',
      code:'import source from "./state.mjs" with {type:"text"};console.log(source.length);'}
  ];
  const output=obfuscateFiles(files,options);
  assert.equal(output.crossFile.properties,0,
    'A text-module import must not be merged with the JavaScript default export');
  assert.equal(output.files.find(file=>file.path==='state.mjs').code,files[0].code,
    'The source bytes observed by a text import must remain unchanged');
});
