'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile,spawnSync}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');
const exec=promisify(execFile);

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleFile */

/** @type {ModuleFile[]} */
const files=[
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
    'const callback=()=>globalThis.RUNTIME_FACTORY;',
    'const holder={callback};',
    'const ctor=await Promise.resolve().then(holder.callback);',
    'const remote=await ctor("return import(\'./state.mjs\')")();',
    "export const result=[state.secretField,inspectRecord('auditCount').value,",
    '  Object.keys(remote.state),remote.state.secretField];'
  ].join('\n')}
];

/**
 * Browser host initialization deliberately occurs before static module
 * evaluation. The implementation bytes are still distributed; dynamic
 * reimport observes their real exported property names.
 * @param {string} folder
 * @returns {string}
 */
function html(folder){
  return [
    '<!doctype html><html><body><pre id="pending">pending</pre>',
    '<script>globalThis.RUNTIME_FACTORY=Function;</script>',
    '<script type="module">',
    "import('/"+folder+"/entry.mjs').then(mod=>{",
    "const node=document.querySelector('pre');",
    "node.id='result';node.textContent=btoa(JSON.stringify(mod.result));",
    "},error=>{const node=document.querySelector('pre');",
    "node.id='error';node.textContent=String(error.stack||error);});",
    '</script></body></html>'
  ].join('\n');
}

test('Chromium host callback through Promise and object holder retains ESM observable keys',
  async t=>{
    const chromium=process.env.CHROMIUM_BIN??'google-chrome';
    const probe=spawnSync(chromium,['--version'],{encoding:'utf8',timeout:5000});
    if(probe.error?.code==='ENOENT') {
      t.skip('Chromium binary not available on this test runner');
      return;
    }
    if(probe.error)throw probe.error;
    assert.equal(probe.status,0,probe.stderr);

    const generated=obfuscateFiles(files,{
      mode:'coo',closedWorld:true,seed:'async-host-browser-parity',
      properties:true,identifiers:false,strings:false
    });
    assert.equal(generated.crossFile.properties,0,
      'A host-returning callback must prevent an observable owner-key rename');

    /** @type {Map<string,string>} */
    const resources=new Map();
    for(const [folder,source] of /** @type {[string,ModuleFile[]][]} */ ([
      ['native',files],
      ['compiled',/** @type {ModuleFile[]} */(generated.files)]
    ]))for(const file of source)resources.set('/'+folder+'/'+file.path,String(file.code));
    resources.set('/native/index.html',html('native'));
    resources.set('/compiled/index.html',html('compiled'));
    const server=http.createServer((req,res)=>{
      const uri=new URL(req.url??'/','http://127.0.0.1');
      const body=resources.get(uri.pathname);
      if(body===undefined){res.writeHead(404).end();return;}
      res.writeHead(200,{'content-type':uri.pathname.endsWith('.html')?
        'text/html; charset=utf-8':'text/javascript; charset=utf-8',
      'cache-control':'no-store'});
      res.end(body);
    });
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',resolve);
    });
    try {
      const address=server.address();
      if(!address||typeof address==='string')throw Error('No local listener address');
      /** @type {unknown[]} */
      const results=[];
      for(const folder of ['native','compiled']) {
        const {stdout}=await exec(chromium,[
          '--headless','--no-sandbox','--disable-gpu',
          '--disable-dev-shm-usage','--no-first-run','--virtual-time-budget=15000',
          '--dump-dom','http://127.0.0.1:'+address.port+'/'+folder+'/index.html'
        ],{timeout:45000,maxBuffer:4*1024*1024,encoding:'utf8'});
        const encoded=stdout.match(new RegExp('<pre id="result">([A-Za-z0-9+/=]+)</pre>','u'))?.[1];
        assert.ok(encoded,'Chromium '+folder+' emitted no result: '+stdout.slice(-1800));
        results.push(JSON.parse(Buffer.from(encoded,'base64').toString('utf8')));
      }
      assert.deepEqual(results[0],[41,3,['secretField'],41]);
      assert.deepEqual(results[1],results[0]);
    }finally{
      await new Promise((resolve,reject)=>
        server.close(error=>error?reject(error):resolve()));
    }
  });
