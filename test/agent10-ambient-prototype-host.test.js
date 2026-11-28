'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,code:string,sourceType:'module'}} Input */
/** @type {[string,string][]} */
const variants=[
  ['prototype-call','Number.prototype.toLocaleString.call(7,"en-US")'],
  ['prototype-reflect','Reflect.apply(Number.prototype.toLocaleString,7,["en-US"])'],
  ['prototype-extract','(()=>{const native=Number.prototype.toLocaleString;return native.call(7,"en-US")})()'],
  ['prototype-alias','(proto=>proto.toLocaleString.call(7,"en-US"))(Number.prototype)'],
  ['prototype-bind','Number.prototype.toLocaleString.bind(7)("en-US")']
];
/** @param {string} expression @returns {Input[]} */
function graphFor(expression){
  return [
    {path:'owner.mjs',sourceType:'module',code:'export const owner={secretField:7};'},
    {path:'main.mjs',sourceType:'module',code:[
      'import {owner} from "./owner.mjs";',
      'const observed=await ('+expression+');',
      'console.log(JSON.stringify({field:owner.secretField,observed}));'
    ].join('\n')}
  ];
}
/** @param {ReadonlyArray<{path:string,code:string|Buffer}>} files @returns {Promise<string>} */
async function execute(files){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-prototype-host-'));
  try{
    for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
    const preload=path.join(root,'host.cjs');
    await atomicWrite(preload,[
      'const {pathToFileURL}=require("node:url");',
      'const path=require("node:path");',
      'const target=pathToFileURL(path.join(process.cwd(),"owner.mjs")).href;',
      'Object.defineProperty(Number.prototype,"toLocaleString",{configurable:true,',
      'value:function(){return import(target).then(remote=>Object.keys(remote.owner));}});'
    ].join('\n'));
    const proc=spawnSync(process.execPath,['-r',preload,path.join(root,'main.mjs')],
      {cwd:root,encoding:'utf8',timeout:15000});
    assert.equal(proc.status,0,proc.stderr||String(proc.error));
    return proc.stdout;
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}
for(const [variant,expression] of variants){
  for(const mode of /** @type {Array<'coo'|'sco'|'sno'>} */ (['coo','sco','sno'])){
    test('ambient prototype method can reenter closed ESM graph '+variant+' '+mode,async()=>{
      const graph=graphFor(expression);
      const native=await execute(graph);
      assert.equal(native,'{"field":7,"observed":["secretField"]}\n');
      const built=obfuscateFiles(graph,{mode,
        seed:'agent10-prototype-host/'+variant+'/'+mode,
        closedWorld:true,properties:true,identifiers:false,strings:false
      });
      const emitted=await execute(built.files);
      assert.equal(emitted,native,
        'Host-overridden native prototype method must not expose renamed own keys');
      assert.equal(built.crossFile.properties,0,
        'Host-exposed native prototype method must veto cross-file key rewriting');
    });
  }
}
