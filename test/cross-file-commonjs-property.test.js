'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'commonjs',code:string}} CommonJsFile */

const graph=/** @type {CommonJsFile[]} */ ([
  {path:'api.cjs',sourceType:'commonjs',
    code:'module.exports={privateCount:41,hiddenAddend:5};'},
  {path:'worker.cjs',sourceType:'commonjs',code:[
    "const api=require('./api.cjs');",
    'const alias=api;',
    'const total=alias.privateCount+alias.hiddenAddend;',
    'console.log(total);',
    'module.exports=total;'
  ].join('\n')},
  {path:'entry.cjs',sourceType:'commonjs',code:[
    "const api=require('./api.cjs');",
    'const {privateCount}=api;',
    'console.log(api.privateCount+api.hiddenAddend+privateCount);'
  ].join('\n')}
]);

/**
 * @param {ReadonlyArray<{path:string,code:string|Buffer}>} files
 * @returns {Promise<{status:number|null,stdout:string,stderr:string}>}
 */
async function execute(files){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-cjs-cross-properties-'));
  try{
    for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
    const entry=spawnSync(process.execPath,[path.join(root,'entry.cjs')],{
      encoding:'utf8',timeout:15000
    });
    const worker=spawnSync(process.execPath,[path.join(root,'worker.cjs')],{
      encoding:'utf8',timeout:15000
    });
    if(entry.error)throw entry.error;
    if(worker.error)throw worker.error;
    return {
      status:entry.status===0&&worker.status===0?0:entry.status??worker.status,
      stdout:entry.stdout+worker.stdout,
      stderr:entry.stderr+worker.stderr
    };
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

/**
 * @param {ReadonlyArray<CommonJsFile>} files
 * @returns {ReturnType<typeof obfuscateFiles>}
 */
function compile(files){
  return obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'closed-cjs-property-graph-20261123',
    identifiers:false,strings:false,properties:true
  });
}

test('closed CommonJS graph renames one private exported record across two require consumers',async()=>{
  const original=await execute(graph);
  assert.equal(original.status,0,original.stderr);
  const transformed=compile(graph);
  assert.equal(transformed.crossFile.objects,1,
    'The one literal module.exports record must be proven across the complete CJS graph');
  assert.equal(transformed.crossFile.properties,2,
    'Both private own fields must be renamed consistently in producer and consumers');
  for(const file of transformed.files){
    if(file.path==='api.cjs'||file.path==='worker.cjs'||file.path==='entry.cjs'){
      assert.doesNotMatch(String(file.code),/privateCount|hiddenAddend/u,
        'Every producer/consumer spelling must be rewritten');
    }
  }
  assert.deepEqual(await execute(transformed.files),original);
});

test('CommonJS property graph refuses a consumer that reflects on own keys',async()=>{
  const files=/** @type {CommonJsFile[]} */ ([
    {path:'api.cjs',sourceType:'commonjs',
      code:'module.exports={secretField:17};'},
    {path:'entry.cjs',sourceType:'commonjs',code:[
      "const api=require('./api.cjs');",
      "console.log(api.secretField,Object.keys(api).join(','));"
    ].join('\n')}
  ]);
  const original=await execute(files);
  assert.equal(original.status,0,original.stderr);
  const transformed=compile(files);
  assert.equal(transformed.crossFile.properties,0);
  assert.deepEqual(await execute(transformed.files),original);
});

test('CommonJS property graph refuses an aliased require loader',async()=>{
  const files=/** @type {CommonJsFile[]} */ ([
    {path:'api.cjs',sourceType:'commonjs',
      code:'module.exports={secretField:19};'},
    {path:'entry.cjs',sourceType:'commonjs',code:[
      'const load=require;',
      "const api=load('./api.cjs');",
      'console.log(api.secretField);'
    ].join('\n')}
  ]);
  const original=await execute(files);
  assert.equal(original.status,0,original.stderr);
  const transformed=compile(files);
  assert.equal(transformed.crossFile.properties,0);
  assert.deepEqual(await execute(transformed.files),original);
});

test('CommonJS property graph refuses unresolved identifier-valued require paths',async()=>{
  const files=/** @type {CommonJsFile[]} */ ([
    {path:'api.cjs',sourceType:'commonjs',
      code:'module.exports={secretField:23};'},
    {path:'entry.cjs',sourceType:'commonjs',code:[
      "const spec='./api.cjs';",
      'const api=require(spec);',
      'console.log(api.secretField);'
    ].join('\n')}
  ]);
  const original=await execute(files);
  assert.equal(original.status,0,original.stderr);
  const transformed=compile(files);
  assert.equal(transformed.crossFile.properties,0);
  assert.deepEqual(await execute(transformed.files),original);
});

test('CommonJS property graph refuses an exported getter instead of assuming inert fields',async()=>{
  const files=/** @type {CommonJsFile[]} */ ([
    {path:'api.cjs',sourceType:'commonjs',code:[
      'module.exports={',
      'get secretField(){return 29;}',
      '};'
    ].join('\n')},
    {path:'entry.cjs',sourceType:'commonjs',code:[
      "const api=require('./api.cjs');",
      'console.log(api.secretField);'
    ].join('\n')}
  ]);
  const original=await execute(files);
  assert.equal(original.status,0,original.stderr);
  const transformed=compile(files);
  assert.equal(transformed.crossFile.properties,0);
  assert.deepEqual(await execute(transformed.files),original);
});
