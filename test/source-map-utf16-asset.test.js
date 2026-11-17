'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {obfuscateFiles,createScoHandler}=require('../src');
const {isSourceMapDocument}=require('../src/source-maps');

const app={path:'index.mjs',sourceType:/** @type {const} */('module'),
  code:'export const publicValue=5;'};
const original='function UTF16_PRIVATE_ORIGINAL_CANARY(){return 76123;}';
const sourceMap=JSON.stringify({
  version:3,sources:['private/original.js'],
  sourcesContent:[original],names:['UTF16_PRIVATE_ORIGINAL_CANARY'],mappings:'AAAA'
});

/**
 * @param {string} text
 * @param {'le'|'be'} endian
 * @param {boolean} bom
 * @returns {Buffer}
 */
function utf16(text,endian,bom){
  const bytes=Buffer.from(text,'utf16le');
  if(endian==='be')bytes.swap16();
  if(!bom)return bytes;
  return Buffer.concat([Buffer.from(endian==='be'?[0xfe,0xff]:[0xff,0xfe]),bytes]);
}

test('UTF-16LE/BE and BOM/no-BOM disguised source maps cannot be shipped',()=>{
  for(const endian of /** @type {const} */(['le','be'])){
    for(const bom of [false,true]){
      for(const prefix of ['', ' \r\n\t']){
        const code=utf16(prefix+sourceMap,endian,bom);
        const name='leak-'+endian+'-'+String(bom)+'-'+String(prefix.length)+'.dat';
        assert.equal(isSourceMapDocument(code),true,name);
        for(const mode of /** @type {const} */(['coo','sno','sco'])){
          assert.throws(()=>obfuscateFiles([
            app,{path:name,sourceType:'asset',code}
          ],{mode,seed:'utf16-map-disclosure'}),/Source-map JSON payload/,mode+' '+name);
        }
        assert.throws(()=>createScoHandler([
          {path:name,sourceType:'asset',code}
        ]),/Source-map JSON payload/,'SCO direct '+name);
      }
    }
  }
});

test('UTF-16 indexed source maps and JSON escaped map field spellings are detected',()=>{
  const indexed=JSON.stringify({
    version:3,sections:[{offset:{line:0,column:0},map:{
      version:3,sources:['original.js'],sourcesContent:[original],mappings:'AAAA'
    }}]
  });
  const escaped=String.raw`{"ver\\u0073ion":3,"sour\\u0063es":["original.js"],"mapp\\u0069ngs":"AAAA"}`;
  for(const payload of [indexed,escaped]){
    for(const endian of /** @type {const} */(['le','be'])){
      const code=utf16(payload,endian,true);
      assert.equal(isSourceMapDocument(code),true,endian+' '+payload.slice(0,50));
    }
  }
});

test('ordinary UTF-16 JSON and opaque binary remain byte-identical',()=>{
  const ordinary=JSON.stringify({
    version:3,sources:['public config'],mappings:{kind:'configuration'}
  });
  const binary=Buffer.from([0x7b,0x00,0x01,0x00,0x9b,0xff]);
  assert.equal(isSourceMapDocument(binary),false);
  for(const endian of /** @type {const} */(['le','be'])){
    for(const bom of [false,true]){
      const code=utf16(ordinary,endian,bom);
      assert.equal(isSourceMapDocument(code),false);
      for(const mode of /** @type {const} */(['coo','sno','sco'])){
        const output=obfuscateFiles([
          app,{path:'config-'+endian+'.bin',sourceType:'asset',code},
          {path:'ordinary.bin',sourceType:'asset',code:binary}
        ],{mode,seed:'utf16-map-positive'});
        assert.deepEqual(output.files[1].code,code);
        assert.deepEqual(output.files[2].code,binary);
      }
      assert.equal(typeof createScoHandler([
        {path:'configuration.bin',sourceType:'asset',code}
      ]),'function');
    }
  }
});
