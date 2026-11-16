'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

const exec=promisify(execFile);

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleFile */

/** @param {string} write @returns {ModuleFile[]} */
function graph(write){
  return [
    {path:'state.mjs',sourceType:'module',code:'export const state={secretField:41};'},
    {path:'record.mjs',sourceType:'module',code:[
      "const schema={externalFormat:'audit-v1',auditCount:3};",
      'export function inspectRecord(key){',
      '  return {',
      '    keys:Reflect.ownKeys(schema).sort(),',
      '    value:schema[key],',
      '    enumerable:Object.getOwnPropertyDescriptor(schema,"externalFormat")?.enumerable===true',
      '  };',
      '}'
    ].join('\n')},
    {path:'entry.mjs',sourceType:'module',code:[
      "import {state} from './state.mjs';",
      "import {inspectRecord} from './record.mjs';",
      write,
      "const value=inspectRecord('externalFormat').value;",
      'export const observed=[state.secretField,value,await globalThis.HOST_OBSERVATION];'
    ].join('\n')}
  ];
}

/** @returns {string} */
function documentSource(){
  return [
    '<!doctype html><html><head><meta charset="utf-8"></head><body>',
    '<script>',
    'const originalOwnKeys=Reflect.ownKeys;',
    'const replacement=Object.create(Reflect);',
    'globalThis.HOST_OBSERVATION=Promise.resolve(null);',
    'replacement.ownKeys=function(receiver){',
    "if(receiver&&receiver.externalFormat==='audit-v1'){",
    "globalThis.HOST_OBSERVATION=import('./state.mjs').then(ns=>Object.keys(ns.state));",
    '}',
    'return originalOwnKeys(receiver);',
    '};',
    'globalThis.HOST_REPLACED_REFLECT=replacement;',
    '</script>',
    '<script type="module">',
    'try{',
    "const program=await import('./entry.mjs');",
    'const pre=document.createElement("pre");pre.id="result";',
    'pre.textContent=btoa(JSON.stringify(program.observed));',
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
  const variants=[
    {
      name:'declared-descriptor-replacement',
      write:"Object.defineProperty(globalThis,'Reflect',{value:globalThis.HOST_REPLACED_REFLECT,configurable:true,writable:true});",
      renamed:0,
      expected:[41,'audit-v1',['secretField']]
    },
    {
      name:'unrelated-global-descriptor',
      write:"Object.defineProperty(globalThis,'UNRELATED_FIXTURE',{value:7,configurable:true});",
      renamed:1,
      expected:[41,'audit-v1',null]
    }
  ];
  /** @type {Map<string,string>} */
  const sources=new Map();
  const html=documentSource();
  for(const variant of variants){
    const original=graph(variant.write);
    const compiled=obfuscateFiles(original,{
      mode:'coo',closedWorld:true,properties:true,identifiers:false,strings:false,
      seed:'browser-global-reflect-descriptor-'+variant.name
    });
    assert.equal(compiled.crossFile.properties,variant.renamed,
      variant.name+' must preserve the safe/refused own-field yield boundary');
    for(const file of original)sources.set('/'+variant.name+'/native/'+file.path,file.code);
    for(const file of compiled.files){
      assert.equal(typeof file.code,'string');
      sources.set('/'+variant.name+'/compiled/'+file.path,
        /** @type {string} */ (file.code));
    }
  }
  const server=http.createServer((request,response)=>{
    if(request.method!=='GET'){response.writeHead(405).end();return;}
    const pathname=new URL(request.url??'/', 'http://localhost').pathname;
    if(pathname.endsWith('/index.html')){
      response.writeHead(200,{'content-type':'text/html; charset=utf-8'});
      response.end(html);return;
    }
    const source=sources.get(pathname);
    if(source===undefined){response.writeHead(404).end();return;}
    response.writeHead(200,{'content-type':'text/javascript; charset=utf-8'});
    response.end(source);
  });
  try{
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',()=>resolve(undefined));
    });
    const address=server.address();
    if(!address||typeof address==='string')throw Error('Local HTTP server unavailable');
    const origin='http://127.0.0.1:'+address.port;
    const cases=[];
    for(const variant of variants){
      for(const kind of ['native','compiled']){
        const {stdout}=await exec(process.env.CHROMIUM_BIN??'google-chrome',[
          '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
          '--no-first-run','--virtual-time-budget=12000','--dump-dom',
          origin+'/'+variant.name+'/'+kind+'/index.html'
        ],{timeout:45000,maxBuffer:5*1024*1024,encoding:'utf8'});
        const encoded=stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
        assert.ok(encoded,variant.name+'/'+kind+' Chromium exception: '+stdout.slice(0,1600));
        const result=JSON.parse(Buffer.from(encoded,'base64').toString('utf8'));
        assert.deepEqual(result,variant.expected,
          variant.name+'/'+kind+' must match exact source-visible environment output');
      }
      cases.push({name:variant.name,renamedPrivateFields:variant.renamed,parity:true});
    }
    console.log('GLOBAL_REFLECT_DESCRIPTOR_CHROMIUM '+JSON.stringify({cases}));
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve(undefined)));
  }
}

if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
