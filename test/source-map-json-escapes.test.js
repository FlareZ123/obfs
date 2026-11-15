'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {obfuscateFiles,createScoHandler}=require('../src');
const {isSourceMapDocument}=require('../src/source-maps');

const app={path:'entry.mjs',sourceType:'module',code:'export const result=7;'};

test('JSON-escaped source map field names cannot bypass opaque asset preflight',()=>{
  const escaped=String.raw`{"ver\u0073ion":3,"sour\u0063es":["original.mjs"],"mapp\u0069ngs":"AAAA","sourcesContent":["function privateCanary(){}"]}`;
  const indexed=String.raw`{"version":3,"sect\u0069ons":[{"offset":{"line":0,"column":0},"map":{"version":3,"sources":["original.mjs"],"mappings":"AAAA","sourcesContent":["function privateCanary(){}"]}}]}`;
  const variants=[escaped,indexed,'\uFEFF'+escaped,' '.repeat(200)+escaped];
  for(const payload of variants) {
    assert.equal(isSourceMapDocument(payload),true);
    assert.equal(isSourceMapDocument(Buffer.from(payload,'utf8')),true);
    for(const mode of /** @type {const} */ (['coo','sco','sno'])) {
      assert.throws(()=>obfuscateFiles([
        app,{path:'renamed.dat',sourceType:'asset',code:Buffer.from(payload)}
      ],{mode}),/Source-map JSON payload/,mode);
    }
    assert.throws(()=>createScoHandler([
      {path:'renamed.dat',sourceType:'asset',code:Buffer.from(payload)}
    ]),/Source-map JSON payload/);
  }
});

test('ordinary JSON and binary objects remain publishable',()=>{
  const safe=String.raw`{"ver\u0073ion":3,"sour\u0063es":["configuration"],"mappings":{"path":"safe"}}`;
  const binary=Buffer.from([0x7f,0x45,0x4c,0x46,0x00,0x01]);
  assert.equal(isSourceMapDocument(safe),false);
  assert.equal(isSourceMapDocument(Buffer.from(safe)),false);
  assert.equal(isSourceMapDocument(binary),false);
  const transformed=obfuscateFiles([
    app,{path:'safe.json',sourceType:'asset',code:Buffer.from(safe)},
    {path:'asset.bin',sourceType:'asset',code:binary}
  ],{mode:'coo',strings:false});
  assert.equal(transformed.files.find(file=>file.path==='safe.json')?.code.toString(),safe);
  assert.deepEqual(transformed.files.find(file=>file.path==='asset.bin')?.code,binary);
  assert.equal(typeof createScoHandler([{path:'safe.json',sourceType:'asset',code:safe}]),'function');
});
