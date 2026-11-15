'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {obfuscateFiles,createScoHandler}=require('../src');
const {hasWasmSourceMapDirective}=require('../src/source-maps');

const binaryHeader=Buffer.from([0,0x61,0x73,0x6d,1,0,0,0]);
const entry={path:'entry.mjs',sourceType:'module',code:'export const answer=42;'};

/**
 * Standard unsigned LEB128 encoding for section sizes.
 * @param {number} size
 * @returns {Buffer}
 */
function leb(size) {
  /** @type {number[]} */
  const output=[];
  do {
    const remaining=size>>>7;
    output.push((size&127)|(remaining?128:0));
    size=remaining;
  }while(size);
  return Buffer.from(output);
}

/**
 * Produce one minimal valid WebAssembly module with one opaque custom section.
 * @param {string} name
 * @param {Buffer} payload
 * @returns {Buffer}
 */
function wasmCustomSection(name,payload) {
  const nameBytes=Buffer.from(name,'utf8');
  const body=Buffer.concat([leb(nameBytes.length),nameBytes,payload]);
  return Buffer.concat([binaryHeader,Buffer.from([0]),leb(body.length),body]);
}

const original=JSON.stringify({
  version:3,sources:['original.ts'],
  sourcesContent:['const WASM_SOURCE_CANARY=912833;'],mappings:'AAAA'
});
const originalUrl='data:application/json;base64,'+Buffer.from(original).toString('base64');
const mapBody=Buffer.concat([leb(Buffer.byteLength(originalUrl)),Buffer.from(originalUrl)]);

test('sourceMappingURL WebAssembly custom section cannot disclose original source via opaque asset',()=>{
  const wasm=wasmCustomSection('sourceMappingURL',mapBody);
  assert.equal(WebAssembly.Module.customSections(new WebAssembly.Module(wasm),'sourceMappingURL').length,1);
  assert.equal(hasWasmSourceMapDirective(wasm),true);
  for(const pathname of ['binary.wasm','hidden.bin','hidden.DAT']) {
    for(const mode of /** @type {const} */ (['coo','sco','sno'])) {
      assert.throws(()=>obfuscateFiles([
        entry,{path:pathname,sourceType:'asset',code:wasm}
      ],{mode}),/WebAssembly source-map custom section/,pathname+' '+mode);
    }
    assert.throws(()=>createScoHandler([
      {path:pathname,sourceType:'asset',code:wasm}
    ]),/WebAssembly source-map custom section/);
  }
});

test('ordinary WebAssembly custom sections remain byte-identical in all modes',()=>{
  const innocuousPayload=Buffer.from('sourceMappingURL appears as ordinary data');
  const wasm=wasmCustomSection('arbitrary',innocuousPayload);
  assert.equal(hasWasmSourceMapDirective(wasm),false);
  assert.doesNotThrow(()=>new WebAssembly.Module(wasm));
  for(const mode of /** @type {const} */ (['coo','sco','sno'])) {
    const result=obfuscateFiles([
      entry,{path:'binary.wasm',sourceType:'asset',code:wasm}
    ],{mode});
    assert.deepEqual(result.files.find(file=>file.path==='binary.wasm')?.code,wasm);
  }
  assert.equal(typeof createScoHandler([
    {path:'binary.wasm',sourceType:'asset',code:wasm}
  ]),'function');
});

test('invalid WebAssembly container with magic bytes refuses preflight; ordinary binary assets survive',()=>{
  const invalid=Buffer.concat([binaryHeader,Buffer.from([0,0x80])]);
  assert.throws(()=>new WebAssembly.Module(invalid),WebAssembly.CompileError);
  for(const mode of /** @type {const} */ (['coo','sco','sno'])) {
    assert.throws(()=>obfuscateFiles([
      entry,{path:'invalid.wasm',sourceType:'asset',code:invalid}
    ],{mode}),/WebAssembly asset cannot be validated/,mode);
  }
  assert.throws(()=>createScoHandler([
    {path:'invalid.wasm',sourceType:'asset',code:invalid}
  ]),/WebAssembly asset cannot be validated/);
  const ordinary=Buffer.from([1,2,3,4,5,6]);
  assert.equal(hasWasmSourceMapDirective(ordinary),false);
  assert.equal(obfuscateFiles([
    entry,{path:'ordinary.bin',sourceType:'asset',code:ordinary}
  ],{mode:'coo'}).files[1].code.toString('hex'),ordinary.toString('hex'));
});
