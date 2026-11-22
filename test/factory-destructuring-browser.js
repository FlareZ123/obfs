'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

/**
 * Exercise the same single-use factory and imported destructuring
 * composition in real Chromium module-loader semantics.
 * @returns {Promise<{cases:number,renamedFields:number,refusals:number}>}
 */
async function runFactoryDestructuringBrowser() {
  /** @type {Map<string,string>} */
  const scripts=new Map();
  /** @type {string[]} */
  const cases=[];
  let renamedFields=0;
  let refusals=0;

  for(let index=0;index<8;index++)for(const kind of
      /** @type {const} */ (['positive','reflection'])) {
    const id=index+'-'+kind;
    const first='privateValue'+index;
    const second='auxiliaryValue'+index;
    const firstName=JSON.stringify(first);
    const secondName=JSON.stringify(second);
    const value=index%3===0?0:index*19+11;
    const tail=index*7+3;
    /** @type {import('../src/core').SourceFile[]} */
    const original=[
      {path:'state.mjs',sourceType:'module',
        code:'const make=()=>({'+firstName+':'+value+','+secondName+':'+tail+'});'+
          'export const shared=make();'},
      {path:'entry.mjs',sourceType:'module',
        code:'import {shared} from "./state.mjs";'+
          'let selected=0,defaults=0;function fallback(){defaults++;return 888;}'+
          '({['+firstName+']:selected=fallback()}=shared);'+
          (kind==='positive' ?
            'export const answer=[selected,shared['+secondName+'],defaults];' :
            'export const answer=[selected,Object.keys(shared).join(","),defaults];')}
    ];
    const emitted=obfuscateFiles(original,{
      mode:'coo',closedWorld:true,seed:'factory-destructuring-browser-'+index,
      strings:false,identifiers:false
    });
    assert.equal(emitted.crossFile.objects,kind==='positive'?1:0,id);
    assert.equal(emitted.crossFile.properties,kind==='positive'?2:0,id);
    if(kind==='positive')renamedFields+=emitted.crossFile.properties;
    else refusals++;
    for(const file of original){
      assert.equal(typeof file.code,'string');
      scripts.set('/native/'+id+'/'+file.path,/** @type {string} */ (file.code));
    }
    for(const file of emitted.files){
      assert.equal(typeof file.code,'string');
      scripts.set('/emitted/'+id+'/'+file.path,/** @type {string} */ (file.code));
    }
    cases.push(id);
  }

  const expected='PASSED:'+cases.length;
  const script='const cases='+JSON.stringify(cases)+';'+
    'Promise.all(cases.map(async id=>{'+
    'const [native,emitted]=await Promise.all(['+
    'import("/native/"+id+"/entry.mjs"),import("/emitted/"+id+"/entry.mjs")]);'+
    'return JSON.stringify(native.answer)===JSON.stringify(emitted.answer);'+
    '})).then(matches=>{'+
    'const failed=matches.findIndex(result=>!result);'+
    'document.getElementById("out").textContent=failed===-1?'+JSON.stringify(expected)+
    ':"MISMATCH:"+cases[failed];'+
    '}).catch(error=>{document.getElementById("out").textContent="ERROR:"+error.message});';
  const html='<!doctype html><html><body><pre id="out">PENDING</pre>'+
    '<script type="module">'+script+'</script></body></html>';

  const server=http.createServer((request,response)=>{
    const requestPath=new URL(request.url??'/','http://localhost').pathname;
    if(requestPath==='/'){
      response.writeHead(200,{'content-type':'text/html; charset=utf-8',
        'cache-control':'no-store'});
      response.end(html);
      return;
    }
    const source=scripts.get(requestPath);
    if(source===undefined){
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200,{'content-type':'text/javascript; charset=utf-8',
      'cache-control':'no-store','x-content-type-options':'nosniff'});
    response.end(source);
  });
  try {
    await new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(undefined)));
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    const browser=process.env.CHROMIUM_BIN??'chromium';
    const {stdout}=await promisify(execFile)(browser,[
      '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
      '--no-first-run','--virtual-time-budget=16000','--dump-dom',
      'http://127.0.0.1:'+address.port+'/'
    ],{timeout:90000,maxBuffer:8*1024*1024,encoding:'utf8',windowsHide:true});
    assert.ok(stdout.includes('<pre id="out">'+expected+'</pre>'),
      'Chromium factory/destructuring graph mismatch: '+stdout.slice(0,1200));
    return {cases:cases.length,renamedFields,refusals};
  }finally {
    await new Promise((resolve,reject)=>server.close(error=>
      error?reject(error):resolve(undefined)));
  }
}

if(require.main===module)runFactoryDestructuringBrowser().then(result=>
  process.stdout.write('OBFS_FACTORY_DESTRUCTURING_BROWSER '+JSON.stringify(result)+'\n')
).catch(error=>{
  process.stderr.write(String(error.stack||error)+'\n');
  process.exitCode=1;
});

module.exports={runFactoryDestructuringBrowser};
