'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

const exec=promisify(execFile);

/** @typedef {{path:string,code:string,sourceType:'module'}} ModuleFile */

/** @type {ModuleFile[]} */
const files=[
  {path:'state.mjs',sourceType:'module',code:'export const state={secretField:41};'},
  {path:'record.mjs',sourceType:'module',code:[
    "const schema={externalFormat:'audit-v1',auditCount:3};",
    'export function inspectRecord(key){return {',
    '  keys:Reflect.ownKeys(schema).sort(),',
    '  enumerable:Object.getOwnPropertyDescriptor(schema,"externalFormat")?.enumerable===true,',
    '  value:schema[key]',
    '};}'
  ].join('\n')},
  {path:'entry.mjs',sourceType:'module',code:[
    "import {state} from './state.mjs';",
    "import {inspectRecord} from './record.mjs';",
    "const captured=inspectRecord('auditCount').value;",
    "const target=new URL('./state.mjs',import.meta.url).href;",
    'const names=typeof captured==="function" ?',
    "  Object.keys((await captured('return import('+JSON.stringify(target)+')')()).state) : null;",
    'export const observed=[state.secretField,names];'
  ].join('\n')}
];

/** @type {Record<string,string>} */
const preload={
  clean:'',
  ownKeys:[
    'const original=Reflect.ownKeys;',
    'Reflect.ownKeys=function(value){',
    "if(Object.prototype.hasOwnProperty.call(value,'auditCount'))value.auditCount=Function;",
    'return original(value);',
    '};'
  ].join('\n'),
  descriptor:[
    'const original=Object.getOwnPropertyDescriptor;',
    'Object.getOwnPropertyDescriptor=function(value,key){',
    "if(Object.prototype.hasOwnProperty.call(value,'auditCount'))value.auditCount=Function;",
    'return original(value,key);',
    '};'
  ].join('\n')
};

/** @param {string} host @returns {string} */
function documentFor(host){
  return [
    '<!doctype html><html><head><meta charset="utf-8"></head><body>',
    '<script>'+preload[host]+'</script>',
    '<script type="module">',
    'try{',
    'const [original,compiled]=await Promise.all([',
    "  import('/native/entry.mjs'),import('/compiled/entry.mjs')",
    ']);',
    'const pre=document.createElement("pre");pre.id="result";',
    'pre.textContent=btoa(JSON.stringify({raw:original.observed,emitted:compiled.observed}));',
    'document.body.append(pre);',
    '}catch(error){',
    'const pre=document.createElement("pre");pre.id="failure";',
    'pre.textContent=String(error.stack||error);document.body.append(pre);',
    '}',
    '</script></body></html>'
  ].join('\n');
}

/** @returns {Promise<void>} */
async function main(){
  const compiled=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,properties:true,identifiers:false,strings:false,
    seed:'browser-host-reflection-callback-20261116'
  });
  const sources=new Map();
  for(const file of files)sources.set('/native/'+file.path,file.code);
  for(const file of compiled.files)sources.set('/compiled/'+file.path,
    /** @type {string} */(file.code));

  const server=http.createServer((request,response)=>{
    if(request.method!=='GET'){response.writeHead(405).end();return;}
    const uri=new URL(request.url??'/', 'http://localhost');
    if(uri.pathname==='/'){
      const host=uri.searchParams.get('host')??'clean';
      if(!Object.hasOwn(preload,host)){response.writeHead(400).end();return;}
      response.writeHead(200,{'content-type':'text/html; charset=utf-8'});
      response.end(documentFor(host));return;
    }
    const source=sources.get(uri.pathname);
    if(source===undefined){response.writeHead(404).end();return;}
    response.writeHead(200,{'content-type':'text/javascript; charset=utf-8'});
    response.end(source);
  });

  try{
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',resolve);
    });
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('HTTP address unavailable');
    const origin='http://127.0.0.1:'+address.port;
    const cases=[];
    for(const host of Object.keys(preload)){
      const {stdout}=await exec(process.env.CHROMIUM_BIN??'google-chrome',[
        '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
        '--no-first-run','--virtual-time-budget=12000','--dump-dom',
        origin+'/?host='+host
      ],{timeout:45000,maxBuffer:5*1024*1024,encoding:'utf8'});
      const encoded=stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
      assert.ok(encoded,'Chromium module evaluation failed for '+host+': '+stdout.slice(0,2000));
      /** @type {{raw:[number,string[]|null],emitted:[number,string[]|null]}} */
      const value=JSON.parse(Buffer.from(encoded,'base64').toString('utf8'));
      assert.deepEqual(value.raw,host==='clean'?[41,null]:[41,['secretField']]);
      if(host==='clean'||compiled.crossFile.properties===0)assert.deepEqual(value.emitted,value.raw);
      else{
        assert.notDeepEqual(value.emitted,value.raw,
          'Injected host callback must expose the transformed source-only key');
        assert.equal(value.emitted[0],41);
        assert.ok(Array.isArray(value.emitted[1]));
      }
      cases.push({host,raw:value.raw,emitted:value.emitted,equal:
        JSON.stringify(value.raw)===JSON.stringify(value.emitted)});
    }
    console.log('HOST_REFLECTION_CHROMIUM '+JSON.stringify({
      renamedPrivateProperties:compiled.crossFile.properties,cases
    }));
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
}

if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
