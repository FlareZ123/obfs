'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleFile */

/**
 * @param {ModuleFile[]} files
 * @param {boolean} host
 * @returns {Promise<string>}
 */
async function run(files,host){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-host-product-matrix-'));
  try{
    for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
    if(host)await atomicWrite(path.join(root,'preload.cjs'),
      'globalThis.RUNTIME_FACTORY=Function;');
    const args=host?['--require',path.join(root,'preload.cjs'),
      path.join(root,'entry.mjs')]:[path.join(root,'entry.mjs')];
    const result=spawnSync(process.execPath,args,{encoding:'utf8',timeout:15000});
    assert.equal(result.status,0,result.stderr);
    return result.stdout;
  }finally{await fs.rm(root,{recursive:true,force:true});}
}

/**
 * @param {string} entry
 * @param {ModuleFile[]} other
 * @returns {ModuleFile[]}
 */
function graph(entry,other){
  return [
    {path:'state.mjs',sourceType:'module',
      code:'export const state={secretField:41};'},
    {path:'record.mjs',sourceType:'module',code:[
      "const schema={externalFormat:'audit-v1',auditCount:3};",
      'export function inspectRecord(key){return {',
      '  keys:Reflect.ownKeys(schema).sort(),value:schema[key],',
      '  enumerable:Object.getOwnPropertyDescriptor(schema,"externalFormat")?.enumerable===true',
      '};}'
    ].join('\n')},
    {path:'entry.mjs',sourceType:'module',code:[
      "import {state} from './state.mjs';",
      "import {inspectRecord} from './record.mjs';",
      entry
    ].join('\n')},...other
  ];
}

/** @type {readonly ['object','array']} */
const shapes=['object','array'];
/** @type {readonly ['local','named','namespace']} */
const origins=['local','named','namespace'];
/** @type {readonly ['direct','wrapper','reaction']} */
const transfers=['direct','wrapper','reaction'];
/** @type {readonly ['flat','nested']} */
const depths=['flat','nested'];

/**
 * @param {string} shape
 * @param {string} origin
 * @param {string} transfer
 * @param {string} depth
 * @returns {ModuleFile[]}
 */
function caseFiles(shape,origin,transfer,depth){
  const imports=origin==='named'?
    "import {getFactory} from './factory.mjs';":
    origin==='namespace'?
      "import * as exports from './factory.mjs';const getFactory=exports.getFactory;":
      'function getFactory(){return globalThis.RUNTIME_FACTORY;}';
  const other=origin==='local'?[]:[
    {path:'factory.mjs',sourceType:/** @type {'module'} */('module'),
      code:'export function getFactory(){return globalThis.RUNTIME_FACTORY;}'}];
  const holder=shape==='object'?'{cb:getFactory}':'[getFactory]';
  const selector=shape==='object'?'.cb':'[0]';
  const producer=transfer==='direct'?['const holder='+holder+';']:
    ['function makeHolder(){return '+holder+';}',
      transfer==='wrapper'?'const holder=makeHolder();':
        'const holder=await Promise.resolve().then(makeHolder);'];
  const reader=depth==='nested'?
    ['const outer={nested:holder};','const callback=outer.nested'+selector+';']:
    ['const callback=holder'+selector+';'];
  return graph([
    imports,...producer,...reader,
    'const ctor=await Promise.resolve().then(callback);',
    'const remote=await ctor("return import(\'./state.mjs\')")();',
    "const result=[inspectRecord('auditCount').value,Object.keys(remote.state),remote.state.secretField];",
    'console.log(JSON.stringify([state.secretField,result]));'
  ].join('\n'),other);
}

for(const shape of shapes)for(const origin of origins)
  for(const transfer of transfers)for(const depth of depths){
    const label=[shape,origin,transfer,depth].join('/');
    test('36-case host callback product matrix: '+label,async()=>{
      const files=caseFiles(shape,origin,transfer,depth);
      const native=await run(files,true);
      assert.equal(native,'[41,[3,["secretField"],41]]\n',label);
      const generated=obfuscateFiles(files,{
        mode:'coo',closedWorld:true,seed:'callback-product-matrix/'+label,
        identifiers:false,strings:false,properties:true
      });
      assert.equal(await run(generated.files,true),native,label);
      assert.equal(generated.crossFile.properties,0,label);
    });
  }

for(const shape of shapes){
  test('numeric '+shape+' holder control preserves one legitimate private rewrite',async()=>{
    const holder=shape==='object'?'{cb:()=>7}':'[()=>7]';
    const reader=shape==='object'?'holder.cb':'holder[0]';
    const files=graph([
      'function unusedFactory(){return globalThis.RUNTIME_FACTORY;}',
      'const holder='+holder+';',
      'const value=await Promise.resolve().then('+reader+');',
      "const result=[inspectRecord('externalFormat').value,value];",
      'console.log(JSON.stringify([state.secretField,result]));'
    ].join('\n'),[]);
    const native=await run(files,false);
    const generated=obfuscateFiles(files,{
      mode:'coo',closedWorld:true,seed:'callback-product-positive/'+shape,
      identifiers:false,strings:false,properties:true
    });
    assert.equal(await run(generated.files,false),native);
    assert.equal(generated.crossFile.properties,1);
  });
}
