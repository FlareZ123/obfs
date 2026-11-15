'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @type {import('../src/core').SourceFile[]} */
const modules=[
  {path:'lib/state.mjs',sourceType:'module',code:'export const state={internalKey:31};'},
  {path:'entry.mjs',sourceType:'module',code:'import {state} from "./lib/state.mjs";console.log(state.internalKey);'}
];

test('inert CSS and raster assets preserve cross-file ESM property mangling',async()=>{
  /** @type {import('../src/core').SourceFile[]} */
  const files=[...modules,
    {path:'styles/site.css',sourceType:'asset',code:Buffer.from('body{color:red}')},
    {path:'image/logo.png',sourceType:'asset',code:Buffer.from([0x89,0x50,0x4e,0x47,0,1])},
    {path:'fonts/site.woff2',sourceType:'asset',code:Buffer.from([1,2,3,4])}
  ];
  const output=obfuscateFiles(files,{
    mode:'coo',seed:'inert-assets-closed-world',closedWorld:true,
    identifiers:false,strings:false
  });
  assert.equal(output.crossFile.properties,1);
  for(const input of files.slice(2)) {
    const result=output.files.find(file=>file.path===input.path);
    assert.ok(result);
    assert.deepEqual(result.code,input.code);
  }
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-inert-assets-'));
  try {
    /** @param {typeof modules|ReturnType<typeof obfuscateFiles>['files']} items */
    async function run(items) {
      for(const file of items) await atomicWrite(path.join(root,file.path),file.code);
      const executed=spawnSync(process.execPath,[path.join(root,'entry.mjs')],{encoding:'utf8',timeout:7000});
      assert.equal(executed.status,0,executed.stderr);
      return executed.stdout.trim();
    }
    assert.equal(await run(modules),'31');
    assert.equal(await run(output.files),'31');
  } finally {
    await fs.rm(root,{recursive:true,force:true});
  }
});

test('HTML and unknown JSON assets keep the full module graph unmodified',()=>{
  /** @type {import('../src/core').SourceFile[]} */
  const potentiallyActiveAssets=[
    {path:'index.html',sourceType:'asset',code:'<script type="module" src="./entry.mjs"></script>'},
    {path:'manifest.json',sourceType:'asset',code:'{"possibleModuleConsumer":"lib/state.mjs"}'}
  ];
  for(const asset of potentiallyActiveAssets) {
    const source=[...modules,asset];
    const result=obfuscateFiles(source,{
      mode:'coo',seed:'active-assets-block',closedWorld:true,
      identifiers:false,strings:false
    });
    assert.equal(result.crossFile.properties,0,asset.path);
    assert.equal(result.files[0].code,source[0].code,asset.path);
  }
});

test('potentially active SVG assets remain outside the inert whitelist',()=>{
  /** @type {import('../src/core').SourceFile[]} */
  const files=[...modules,{path:'vector.svg',sourceType:'asset',
    code:'<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><p>safe markup</p></foreignObject></svg>'}];
  const result=obfuscateFiles(files,{
    mode:'coo',seed:'svg-active',closedWorld:true,identifiers:false,strings:false
  });
  assert.equal(result.crossFile.properties,0);
});

test('inline executable HTML and SVG assets are explicitly refused by source audit',()=>{
  /** @type {import('../src/core').SourceFile[]} */
  const active=[
    {path:'index.html',sourceType:'asset',
      code:'<script type="module">import {state} from "./lib/state.mjs"</script>'},
    {path:'vector.svg',sourceType:'asset',
      code:'<svg xmlns="http://www.w3.org/2000/svg"><script>console.log(1)</script></svg>'}
  ];
  for(const asset of active) {
    assert.throws(()=>obfuscateFiles([...modules,asset],{
      mode:'coo',seed:'active-asset-refusal',closedWorld:true,identifiers:false,strings:false
    }),/(?:HTML|SVG) asset contains/);
  }
});
