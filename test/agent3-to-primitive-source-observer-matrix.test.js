'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

const cases=[
  ['unary plus','+reader',true],
  ['unary minus','-reader',true],
  ['bitwise not','~reader',true],
  ['binary subtraction','reader-1',true],
  ['binary multiplication','reader*1',true],
  ['binary division','reader/1',true],
  ['binary remainder','reader%1',true],
  ['binary exponentiation','reader**1',true],
  ['binary left shift','reader<<1',true],
  ['binary signed right shift','reader>>1',true],
  ['binary unsigned right shift','reader>>>1',true],
  ['binary bitwise and','reader&1',true],
  ['binary bitwise or','reader|1',true],
  ['binary bitwise xor','reader^1',true],
  ['Math.abs','Math.abs(reader)',true],
  ['Number','Number(reader)',true],
  ['global isNaN','isNaN(reader)',true],
  ['parseInt','parseInt(reader,10)',true],
  ['Boolean positive control','Boolean(reader)',false],
  ['typeof positive control','typeof reader',false]
];

const patcher=[
  'const original=Function.prototype.toString;',
  'globalThis.__functionSources=[];',
  'Function.prototype.toString=function(){',
  '  const source=original.call(this);',
  '  globalThis.__functionSources.push(source);',
  '  return source;',
  '};',
  'export function install(){globalThis.__functionSources.length=0;}'
].join('\n');

async function run(code){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-to-primitive-'));
  try{
    const packageDir=path.join(root,'node_modules','patcher');
    await fs.mkdir(packageDir,{recursive:true});
    await fs.writeFile(path.join(packageDir,'package.json'),
      JSON.stringify({type:'module',exports:'./index.mjs'}));
    await fs.writeFile(path.join(packageDir,'index.mjs'),patcher);
    await atomicWrite(path.join(root,'app.mjs'),code);
    const entryUrl=pathToFileURL(path.join(root,'app.mjs')).href;
    const command='import('+JSON.stringify(entryUrl)+').then(m=>console.log(JSON.stringify({capturedSource:m.capturedSource,result:m.result}))).catch(e=>{console.error(e);process.exitCode=1});';
    const child=spawnSync(process.execPath,['--input-type=module','-e',command],{
      cwd:root,encoding:'utf8'
    });
    assert.equal(child.status,0,child.stderr);
    return JSON.parse(child.stdout.trim());
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

test('numeric and abstract coercions preserve source observed by an unlisted external patcher',async t=>{
  for(const [label,expression,observes] of cases){
    await t.test(label,async()=>{
      const source=[
        "import {install} from 'patcher';",
        "function reader(secretValue){return secretValue+1;}",
        "install();",
        `export const result=${expression};`,
        "export const capturedSource=globalThis.__functionSources[0]??'';"
      ].join('\n');
      const output=obfuscateFiles([{path:'app.mjs',code:source}],{
        mode:'coo',seed:'to-primitive-source-observer',properties:false,
        strings:false,identifiers:true
      });
      const native=await run(source);
      const transformed=await run(output.files[0].code);
      if(observes)assert.ok(native.capturedSource.includes('secretValue'),
        'native coercion must call patched Function#toString');
      else assert.equal(native.capturedSource,'',
        'the positive control must not invoke Function#toString');
      assert.equal(transformed.capturedSource,native.capturedSource,
        'the external observer must see unchanged source or the compiler must refuse edits');
    });
  }
});
