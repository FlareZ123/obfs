'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

const runBrowser=promisify(execFile);

/** @typedef {{value:number,source:string,privateValue:number}} Observation */

/**
 * An unsupplied external browser importer reads the native class prototype
 * method source. The compiler receives only the listed application modules.
 */
const originals=[
  {path:'owner.mjs',sourceType:/** @type {const} */ ('module'),
    code:'export const owner={secretField:7};'},
  {path:'state.mjs',sourceType:/** @type {const} */ ('module'),
    code:"import {owner} from './owner.mjs';class Reader{read(){return owner.secretField;}}export const instance=new Reader();"},
  {path:'private.mjs',sourceType:/** @type {const} */ ('module'),
    code:'const hidden={privateField:13};export const privateValue=hidden.privateField;'}
];

const html=[
  '<!doctype html><meta charset="utf-8"><script type="module">',
  'try {',
  '  const {instance}=await import("./state.mjs");',
  '  const {privateValue}=await import("./private.mjs");',
  '  const source=Function.prototype.toString.call(Object.getPrototypeOf(instance).read);',
  '  const observation={value:instance.read(),source,privateValue};',
  '  const pre=document.createElement("pre");pre.id="result";',
  '  pre.textContent=btoa(JSON.stringify(observation));document.body.appendChild(pre);',
  '}catch(error){',
  '  const pre=document.createElement("pre");pre.id="failure";',
  '  pre.textContent=String(error.stack||error);document.body.appendChild(pre);',
  '}',
  '</script>'
].join('\n');

/**
 * Runs exact original and emitted ESM graphs in a real Chromium browser
 * through the native module linker, using the same external inspector.
 * @returns {Promise<{sourceEqual:boolean,privatePropertyRenames:number,crossFilePropertyRenames:number}>}
 */
async function main(){
  const output=obfuscateFiles(originals,{
    mode:'coo',closedWorld:true,properties:true,identifiers:false,strings:false,
    seed:'agent9-public-instance-browser-source'
  });
  /** @type {Map<string,string>} */
  const paths=new Map();
  for(const file of originals)paths.set('/original/'+file.path,file.code);
  for(const file of output.files) {
    assert.equal(typeof file.code,'string');
    paths.set('/emitted/'+file.path,/** @type {string} */ (file.code));
  }
  const server=http.createServer((request,response)=>{
    const pathname=new URL(request.url??'/', 'http://localhost').pathname;
    if(request.method!=='GET'){response.writeHead(405).end();return;}
    if(pathname==='/original/index.html'||pathname==='/emitted/index.html'){
      response.writeHead(200,{'content-type':'text/html; charset=utf-8'});
      response.end(html);return;
    }
    const code=paths.get(pathname);
    if(code===undefined){response.writeHead(404).end();return;}
    response.writeHead(200,{'content-type':'text/javascript; charset=utf-8'});
    response.end(code);
  });
  try {
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',()=>resolve(undefined));
    });
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('Missing browser fixture port');
    const origin='http://127.0.0.1:'+address.port;
    /**
     * @param {'original'|'emitted'} variant
     * @returns {Promise<Observation>}
     */
    async function observe(variant){
      const {stdout}=await runBrowser(process.env.CHROMIUM_BIN??'google-chrome',[
        '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
        '--no-first-run','--virtual-time-budget=12000','--dump-dom',
        origin+'/'+variant+'/index.html'
      ],{encoding:'utf8',timeout:45000,maxBuffer:4*1024*1024});
      const encoded=stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
      assert.ok(encoded,variant+' browser failure: '+stdout.slice(0,1200));
      return /** @type {Observation} */ (JSON.parse(Buffer.from(encoded,'base64').toString('utf8')));
    }
    const native=await observe('original');
    const actual=await observe('emitted');
    const privatePropertyRenames=output.files.find(file=>
      file.path==='private.mjs')?.metrics.properties??0;
    assert.deepEqual({value:actual.value,privateValue:actual.privateValue},
      {value:native.value,privateValue:native.privateValue});
    assert.ok(privatePropertyRenames>0,
      'Unrelated private module must retain positive property yield');
    assert.equal(actual.source,native.source,JSON.stringify({native,actual,
      crossFilePropertyRenames:output.crossFile.properties,privatePropertyRenames},null,2));
    const report={sourceEqual:true,privatePropertyRenames,
      crossFilePropertyRenames:output.crossFile.properties};
    process.stdout.write('EXPORTED_INSTANCE_SOURCE_BROWSER '+JSON.stringify(report)+'\n');
    return report;
  }finally {
    await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve(undefined)));
  }
}

if(require.main===module)main().catch(error=>{
  process.stderr.write(String(error.stack||error)+'\n');process.exitCode=1;
});
module.exports={main};
