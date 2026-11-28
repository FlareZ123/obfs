'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {spawnSync}=require('node:child_process');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {obfuscateFiles}=require('../src');

/** @typedef {{path:string,code:string,sourceType:'module'}} ModuleFile */
const observedState=
  'const state={secretField:73};export function inspect(){return state.secretField;}';
const primitiveState=
  'const state={secretField:73};'+
  'function privateInspect(){return state.secretField;}'+
  'export function inspect(){return privateInspect();}';
const observedMain=
  'import {inspect} from "./state.mjs";'+
  'const parser=new DOMParser();'+
  'console.log(JSON.stringify({source:parser.parseFromString(inspect,"text/html").body.textContent,value:inspect()}));';
const primitiveMain=
  'import {inspect} from "./state.mjs";'+
  'const parser=new DOMParser();'+
  'console.log(JSON.stringify({source:parser.parseFromString("ordinary","text/html").body.textContent,value:inspect()}));';

/**
 * Inject a Web IDL string-converting host outside both compiled modules.
 * The real browser DOMParser document parsing is validated separately.
 * @param {ModuleFile[]} files
 * @returns {Promise<string>}
 */
async function execute(files){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-domparser-'));
  try{
    for(const file of files)await fs.writeFile(path.join(dir,file.path),file.code);
    const setup='globalThis.DOMParser=class {parseFromString(source,type){'+
      'if(type!=="text/html")throw Error("mime");'+
      'return {body:{textContent:String(source)}}}};'+
      'await import("./main.mjs");';
    const result=spawnSync(process.execPath,
      ['--input-type=module','--eval',setup],{
        cwd:dir,encoding:'utf8',timeout:10000
      });
    assert.equal(result.status,0,result.stderr);
    return result.stdout;
  }finally{
    await fs.rm(dir,{recursive:true,force:true});
  }
}

/** @param {string} main @param {string} [state] @returns {ModuleFile[]} */
function graph(main,state=observedState){
  return [{path:'state.mjs',sourceType:'module',code:state},
    {path:'main.mjs',sourceType:'module',code:main}];
}
for(const mode of /** @type {const} */(['coo','sco','sno'])){
  test(mode+' refuses imported function-source changes through DOMParser host',async()=>{
    const files=graph(observedMain);
    const native=await execute(files);
    assert.match(native,/secretField/);
    const emitted=obfuscateFiles(files,{
      mode,closedWorld:true,seed:'domparser-extern-observer/'+mode,
      identifiers:false,strings:false,properties:true
    });
    assert.equal(emitted.files[0].code,observedState,
      'Imported function source must remain verbatim');
    assert.equal(await execute(/** @type {ModuleFile[]} */(emitted.files)),native);
  });
  test(mode+' rewrites a private helper when DOMParser sees only a primitive',async()=>{
    const files=graph(primitiveMain,primitiveState);
    const native=await execute(files);
    const emitted=obfuscateFiles(files,{
      mode,closedWorld:true,seed:'domparser-extern-primitive/'+mode,
      identifiers:false,strings:false,properties:true
    });
    assert.ok(emitted.files[0].metrics.objects>=1 ||
      emitted.crossFile.properties>=1,
      'Parser primitive input must retain a real private owner rewrite');
    assert.ok(!emitted.files[0].code.includes('secretField'));
    assert.equal(await execute(/** @type {ModuleFile[]} */(emitted.files)),native);
  });
}
