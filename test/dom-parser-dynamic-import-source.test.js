'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {spawnSync}=require('node:child_process');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {obfuscateFiles}=require('../src');

/** @typedef {{path:string,sourceType:'module',code:string}} File */
/**
 * A top-level-await import acquires a bound native DOMParser method
 * while the consumer's source never names DOMParser. An external host
 * performs the DOMString conversion, not any compiled module.
 * @param {File[]} files
 * @returns {Promise<{text:string,value:number}>}
 */
async function evaluate(files){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-dom-dynamic-'));
  try{
    for(const file of files)await fs.writeFile(path.join(dir,file.path),file.code);
    const source='globalThis.DOMParser=class {parseFromString(value,mime){'+
      'if(mime!=="text/html")throw Error("mime");'+
      'return {body:{textContent:String(value)}}}};'+
      'const data=await import("./user.mjs");'+
      'console.log(JSON.stringify({text:data.text,value:data.sample(7)}));';
    const proc=spawnSync(process.execPath,['--input-type=module','--eval',source],{
      cwd:dir,encoding:'utf8',timeout:10000
    });
    assert.equal(proc.status,0,proc.stderr);
    return /** @type {{text:string,value:number}} */ (JSON.parse(proc.stdout));
  }finally{
    await fs.rm(dir,{recursive:true,force:true});
  }
}

/** @type {Array<[string,string,string]>} */
const cases=[
  ['dynamic-destructured',
    'const {parse:htmlRead}=await import("./methods.mjs");','htmlRead'],
  ['dynamic-namespace',
    'const htmlTools=await import("./methods.mjs");','htmlTools.parse'],
  ['dynamic-namespace-computed',
    'const htmlTools=await import("./methods.mjs");const key="parse";','htmlTools[key]']
];
for(const [name,preamble,callee] of cases){
  for(const mode of /** @type {const} */(['coo','sco','sno'])){
    for(const observes of [true,false]){
      test(mode+' DOMParser dynamic import '+name+
        (observes?' source':' primitive'),async()=>{
        /** @type {File[]} */
        const files=[
          {path:'methods.mjs',sourceType:'module',
            code:'const p=new DOMParser();'+
              'export const parse=p.parseFromString.bind(p);'},
          {path:'user.mjs',sourceType:'module',code:preamble+
            'export function sample(x){return x^17;}'+
            'export const text='+callee+
            (observes?'(sample,"text/html").body.textContent;':
              '("ordinary","text/html").body.textContent;')}
        ];
        const native=await evaluate(files);
        if(observes)assert.match(native.text,/x\^17/);
        /** @type {ReturnType<typeof obfuscateFiles>|null} */
        let output=null;
        try{
          output=obfuscateFiles(files,{
            mode,seed:'dom-dynamic/'+name+'/'+mode+'/'+observes,
            identifiers:false,strings:false,properties:false,
            experimentalWasmI32:{'user.mjs':['sample']}
          });
        }catch(error){
          if(!observes)throw error;
          assert.match(String(error),/Wasm|source|declined/i);
          return;
        }
        assert.ok(output);
        if(!observes){
          const emitted=output.files.find(file=>file.path==='user.mjs');
          assert.ok(emitted);
          assert.match(String(emitted.code),/WebAssembly/);
        }
        assert.deepEqual(await evaluate(/** @type {File[]} */(output.files)),native);
      });
    }
  }
}
