'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {gzipSync,brotliCompressSync}=require('node:zlib');
const {obfuscateFiles,createScoHandler}=require('../src');

const app={path:'main.mjs',sourceType:/** @type {const} */('module'),
  code:'const state={secretField:11};console.log(state.secretField);'};
const leakedSource=Buffer.from('export const hiddenSource="original-program";\n');
const leakedMap=Buffer.from(JSON.stringify({
  version:3,sources:['original.js'],sourcesContent:[leakedSource.toString()],
  names:['hiddenSource'],mappings:'AAAA'
}));

/** @type {{name:string,code:Buffer}[]} */
const containers=[
  {name:'bundle.js.gz',code:gzipSync(leakedSource)},
  {name:'source-map.json.gz',code:gzipSync(leakedMap)},
  {name:'bundle.js.br',code:brotliCompressSync(leakedSource)},
  {name:'opaque.bin',code:gzipSync(leakedMap)},
  {name:'inline.svgz',code:gzipSync(Buffer.from('<svg><script>console.log(1)</script></svg>'))},
  {name:'hidden.zip',code:Buffer.from([0x50,0x4b,0x03,0x04,0,0,0,0])},
  {name:'hidden.bin',code:Buffer.from([0x28,0xb5,0x2f,0xfd,0,0,0,0])},
  {name:'hidden.xz',code:Buffer.from([0xfd,0x37,0x7a,0x58,0x5a,0x00])},
  {name:'hidden.7z',code:Buffer.from([0x37,0x7a,0xbc,0xaf,0x27,0x1c])},
  {name:'hidden.bz2',code:Buffer.from([0x42,0x5a,0x68,0x39,0,0])},
  {name:'hidden.tar',code:Buffer.concat([
    Buffer.alloc(257),Buffer.from('ustar'),Buffer.alloc(200)])},
  {name:'misnamed.zip',code:Buffer.from('arbitrary archive payload')}
];

test('opaque compressed source containers are refused across SCO COO and SNO',()=>{
  for(const {name,code} of containers){
    const asset={path:name,sourceType:/** @type {const} */('asset'),code};
    for(const mode of /** @type {const} */(['coo','sco','sno'])) {
      assert.throws(()=>obfuscateFiles([app,asset],{
        mode,seed:'archive-preflight/'+name
      }),/Compressed or archived asset cannot be audited for source disclosure/u,
      mode+' '+name);
    }
    assert.throws(()=>createScoHandler([app,asset]),/Compressed or archived asset/u,
      'SCO handler '+name);
  }
});

test('ordinary raster images and CSS are still returned byte-exact',()=>{
  const picture=Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
  const css=Buffer.from('body { color: #135; }\n');
  for(const mode of /** @type {const} */(['coo','sco','sno'])) {
    const output=obfuscateFiles([
      app,
      {path:'logo.png',sourceType:'asset',code:picture},
      {path:'theme.css',sourceType:'asset',code:css}
    ],{mode,seed:'archive-positive-control'});
    assert.deepEqual(output.files.find(file=>file.path==='logo.png')?.code,picture);
    assert.deepEqual(output.files.find(file=>file.path==='theme.css')?.code,css);
  }
});

test('preflight refuses gzip bytes even when the file extension is an image',()=>{
  const disguised=gzipSync(Buffer.from('/*# sourceMappingURL=data:application/json;base64,AA */'));
  assert.throws(()=>obfuscateFiles([
    app,{path:'picture.png',sourceType:'asset',code:disguised}
  ],{mode:'coo'}),/Compressed or archived asset/u);
});
