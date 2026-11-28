'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const http=require('node:http');
const puppeteer=require('puppeteer-core');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleFile */

/**
 * A bounded deterministic family of direct and indirect carriers. Every
 * expression must resolve to an object with exactly the same original own
 * keys. The external callback is deliberately allowed to inspect those keys,
 * not just to return a scalar derived from the field values.
 *
 * @type {ReadonlyArray<readonly [string,string]>}
 */
const CARRIERS=[
  ['direct','state'],
  ['imported-identity','identity(state)'],
  ['nested-identity','identity(identity(state))'],
  ['imported-return','forward(state)'],
  ['arrow-return','(x=>x)(state)'],
  ['function-call','identity.call(null,state)'],
  ['function-apply','identity.apply(null,[state])'],
  ['function-bind','identity.bind(null,state)()'],
  ['reflect-apply','Reflect.apply(identity,null,[state])'],
  ['promise-resolve','await Promise.resolve(state)'],
  ['promise-all','(await Promise.all([state]))[0]'],
  ['promise-then','await Promise.resolve(state).then(x=>x)'],
  ['microtask','await new Promise(r=>queueMicrotask(()=>r(state)))'],
  ['sync-generator','(function*(){yield state})().next().value'],
  ['async-generator','(await (async function*(){yield state})().next()).value'],
  ['async-return','await (async()=>state)()'],
  ['array-destructure','(([x])=>x)([state])'],
  ['object-destructure','(({value})=>value)({value:state})'],
  ['array-at','[state].at(0)'],
  ['array-find','[state].find(()=>true)'],
  ['array-reduce','[state].reduce((_,x)=>x,null)'],
  ['array-flatmap','[state].flatMap(x=>[x])[0]'],
  ['array-from','Array.from([state])[0]'],
  ['map-get','new Map([["record",state]]).get("record")'],
  ['set-iterator','new Set([state]).values().next().value'],
  ['weakmap-get','(()=>{const k={};const m=new WeakMap([[k,state]]);return m.get(k)})()'],
  ['weakref-deref','new WeakRef(state).deref()'],
  ['object-values','Object.values({record:state})[0]'],
  ['object-entries','Object.entries({record:state})[0][1]'],
  ['object-descriptor','Object.getOwnPropertyDescriptor({record:state},"record").value'],
  ['object-spread','({...state})'],
  ['object-assign','Object.assign({},state)'],
  ['object-from-entries','Object.fromEntries(Object.entries(state))'],
  ['json-roundtrip','JSON.parse(JSON.stringify(state))'],
  ['structured-clone','structuredClone(state)'],
  ['reflect-get','Reflect.get({record:state},"record")'],
  ['accessor-get','({get record(){return state}}).record'],
  ['proxy-get','new Proxy({record:state},{}).record'],
  ['class-static','(()=>{class Holder{static record=state;}return Holder.record})()'],
  ['class-instance','new (class Holder{constructor(x){this.record=x}})(state).record']
];

/**
 * Create a real 3-module ESM program with a caller-owned external interface.
 * The compiler cannot assume ownership over window.host.capture's key-name
 * contract, even if its implementation happens to be visible in this fixture.
 *
 * @param {string} expression
 * @param {boolean} [dropTrace] Deliberately wrong but return-identical oracle mutant
 * @returns {ModuleFile[]}
 */
function graph(expression,dropTrace=false){
  return [
    {path:'state.mjs',sourceType:'module',
      code:'export const state={secretField:41,otherField:13};'},
    {path:'relay.mjs',sourceType:'module',
      code:'export const identity=x=>x;export function forward(x){return identity(x);}'},
    {path:'entry.mjs',sourceType:'module',code:[
      'import {state} from "./state.mjs";',
      'import {identity,forward} from "./relay.mjs";',
      'const trace=[];',
      'globalThis.window={host:{capture(value){',
      'const keys=Reflect.ownKeys(value).filter(x=>typeof x==="string").sort();',
      (dropTrace?'if(false)':'')+
        'trace.push({keys,secret:value.secretField,other:value.otherField,'+
        'own:Object.prototype.hasOwnProperty.call(value,"secretField"),'+
        'descriptor:Object.getOwnPropertyDescriptor(value,"secretField")?.value??null});',
      'return 7;}}};',
      'const carried=('+expression+');',
      'const outcome=globalThis.window.host.capture(carried);',
      'console.log(JSON.stringify({outcome,trace}));'
    ].join('\n')}
  ];
}

/**
 * Run the actual native Node ESM loader rather than a mocked source parser.
 * Serialize the entire output to retain own-key spelling, value types,
 * host callback trace, and exception behavior.
 *
 * @param {ReadonlyArray<{path:string,code:string|Buffer}>} files
 * @returns {Promise<{status:number|null,stdout:string,stderr:string}>}
 */
async function execute(files){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-host-carrier-'));
  try{
    for(const file of files)await atomicWrite(path.join(dir,file.path),file.code);
    const result=spawnSync(process.execPath,[path.join(dir,'entry.mjs')],{
      cwd:dir,encoding:'utf8',timeout:15000
    });
    assert.equal(result.error,undefined,result.error?.message);
    return {status:result.status,stdout:result.stdout,stderr:result.stderr};
  } finally {
    await fs.rm(dir,{recursive:true,force:true});
  }
}

test('source-visible external callback oracle catches a return-identical host-drop mutant',async()=>{
  const original=await execute(graph('state'));
  const mutant=await execute(graph('state',true));
  assert.equal(original.status,0,original.stderr);
  assert.equal(mutant.status,0,mutant.stderr);
  const a=JSON.parse(original.stdout),b=JSON.parse(mutant.stdout);
  assert.equal(a.outcome,7);
  assert.equal(b.outcome,7,'Mutation must leave scalar return unchanged');
  assert.equal(a.trace.length,1,'Oracle must observe a nonvacuous host callback');
  assert.equal(b.trace.length,0,'Mutation must drop host callback trace');
  assert.notDeepEqual(a,b,'Typed external trace must reject the mutation');
});

for(const mode of /** @type {const} */ (['coo','sno','sco'])){
  test('cross-file host-visible owner keys and interprocedural carriers: '+mode,async()=>{
    let compiled=0,refused=0,rewriteCases=0;
    for(let i=0;i<CARRIERS.length;i++){
      const [name,expression]=CARRIERS[i];
      const original=graph(expression);
      const native=await execute(original);
      assert.equal(native.status,0,name+': native ESM failed: '+native.stderr);
      const expected=JSON.parse(native.stdout);
      assert.deepEqual(expected,{
        outcome:7,
        trace:[{keys:['otherField','secretField'],secret:41,other:13,own:true,descriptor:41}]
      },name+': native host trace is not a valid comparison control');
      /** @type {ReturnType<typeof obfuscateFiles>} */
      let emitted;
      try{
        emitted=obfuscateFiles(original,{
          mode,closedWorld:true,properties:true,identifiers:false,strings:false,
          seed:'agent8-host-carrier-'+mode+'-'+name+'-'+i
        });
      }catch(error){
        // Conservative preflight refusal is valid, but cannot count as parity.
        assert.ok(error instanceof Error,name+': unexpected non-error refusal');
        refused++;
        continue;
      }
      compiled++;
      if(emitted.crossFile.properties || emitted.files.some(f=>f.metrics.properties))
        rewriteCases++;
      const actual=await execute(emitted.files);
      assert.deepEqual(actual,native,
        name+' ('+mode+'): compiled ESM changed return, own keys, external effects, or throws');
    }
    assert.ok(compiled>=CARRIERS.length/2,
      mode+': too many refusals to call this a meaningful compatibility matrix');
    process.stdout.write('HOST_CARRIER_MATRIX '+
      JSON.stringify({mode,scenarios:CARRIERS.length,compiled,refused,rewriteCases})+'\n');
  });
}


test('positive cross-file owner control performs actual field rewrites',async()=>{
  /** @type {ModuleFile[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',
      code:'export const state={secretField:41,otherField:13};'},
    {path:'entry.mjs',sourceType:'module',
      code:'import {state} from "./state.mjs";'+
        'console.log(JSON.stringify([state.secretField,state.otherField]));'}
  ];
  const native=await execute(files);
  assert.equal(native.status,0,native.stderr);
  assert.equal(native.stdout,'[41,13]\n');
  const output=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,properties:true,identifiers:false,strings:false,
    seed:'agent8-host-carrier-nonvacuous-positive'
  });
  assert.equal(output.crossFile.objects,1,
    'A closed safe imported owner must remain transformable');
  assert.equal(output.crossFile.properties,2,
    'The control must rewrite both owned fields, not just run unmodified code');
  assert.deepEqual(await execute(output.files),native);
});


/**
 * Browser version of the *same* source fixture. Browsers expose window as a
 * read-only self-reference, so change only the host attachment and observation
 * destination; the carrier expressions and original field spellings are
 * identical to the native ESM test above.
 * @param {string} expression
 * @returns {ModuleFile[]}
 */
function browserGraph(expression) {
  return graph(expression).map(file=>{
    if(file.path!=='entry.mjs')return file;
    let code=file.code.replace(
      'globalThis.window={host:{capture(value){',
      'globalThis.window.host={capture(value){'
    ).replace('return 7;}}};','return 7;}};');
    code=code.replace('console.log(JSON.stringify({outcome,trace}));',
      'globalThis.__hostCarrierResult={outcome,trace};');
    assert.notEqual(code,file.code,'Browser host attachment must be different');
    return {...file,code};
  });
}

test('real Chromium ESM preserves external own-key trace under strict CSP',{
  skip:process.platform!=='linux'
},async()=>{
  const selected=[0,1,3,6,9,11,14,18,23,27,30,33,35,39];
  /** @type {Map<string,string|Buffer>} */
  const assets=new Map([['/index.html','<!doctype html><title>carrier parity</title>']]);
  for(let i=0;i<selected.length;i++){
    const [name,expression]=CARRIERS[selected[i]];
    const original=browserGraph(expression);
    const transformed=obfuscateFiles(original,{
      mode:'coo',closedWorld:true,properties:true,identifiers:false,strings:false,
      seed:'agent8-host-carrier-chrome-'+name+'-'+i
    });
    for(const file of original)assets.set('/native-'+i+'/'+file.path,file.code);
    for(const file of transformed.files)
      assets.set('/emitted-'+i+'/'+file.path,file.code);
  }
  /** @type {ModuleFile[]} */
  const safe=[
    {path:'state.mjs',sourceType:'module',code:'export const state={secretField:41,otherField:13};'},
    {path:'entry.mjs',sourceType:'module',code:
      'import {state} from "./state.mjs";'+
      'console.log(JSON.stringify([state.secretField,state.otherField]));'}
  ];
  const safeOutput=obfuscateFiles(safe,{
    mode:'coo',closedWorld:true,properties:true,identifiers:false,strings:false,
    seed:'agent8-host-carrier-browser-nonvacuous-positive'
  });
  assert.equal(safeOutput.crossFile.properties,2,
    'Browser comparison must include actually rewritten safe exported fields');
  for(const file of safe)assets.set('/safe-native/'+file.path,file.code);
  for(const file of safeOutput.files)assets.set('/safe-emitted/'+file.path,file.code);
  const strictCsp="default-src 'none'; script-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'";
  let requests=0;
  const server=http.createServer((req,res)=>{
    const file=assets.get(req.url??'');
    if(req.method!=='GET'||file===undefined){res.writeHead(404).end();return;}
    if(req.url?.endsWith('.mjs'))requests++;
    res.writeHead(200,{
      'Content-Type':req.url?.endsWith('.mjs')?'text/javascript; charset=utf-8':'text/html; charset=utf-8',
      'Cache-Control':'no-store',
      'Content-Security-Policy':strictCsp,
      'X-Content-Type-Options':'nosniff'
    });
    res.end(file);
  });
  /** @type {import('puppeteer-core').Browser|undefined} */
  let browser;
  try {
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',()=>resolve(true));
    });
    const addr=server.address();
    assert.ok(addr&&typeof addr!=='string');
    browser=await puppeteer.launch({
      executablePath:process.env.CHROMIUM_BIN??'/usr/bin/google-chrome',
      headless:true,
      args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run']
    });
    const page=await browser.newPage();
    await page.goto('http://127.0.0.1:'+addr.port+'/index.html',{
      waitUntil:'domcontentloaded',timeout:60000
    });
    const report=await page.evaluate(async count=>{
      let blocked=false;
      try{(0,eval)('1+1');}catch(error){blocked=/EvalError|Content Security Policy|unsafe-eval|Refused to evaluate/u.test(String(error));}
      /** @type {{index:number,native:string,emitted:string}[]} */
      const rows=[];
      for(let i=0;i<count;i++){
        await import('/native-'+i+'/entry.mjs');
        const native=JSON.stringify(/** @type {any} */(globalThis).__hostCarrierResult);
        await import('/emitted-'+i+'/entry.mjs');
        const emitted=JSON.stringify(/** @type {any} */(globalThis).__hostCarrierResult);
        rows.push({index:i,native,emitted});
      }
      const logs=[];
      const originalLog=console.log;
      try{
        console.log=(...values)=>logs.push(values.map(String).join(' '));
        await import('/safe-native/entry.mjs');
        await import('/safe-emitted/entry.mjs');
      }finally {console.log=originalLog;}
      return {blocked,rows,logs};
    },selected.length);
    assert.equal(report.blocked,true,
      'The browser probe must establish strict CSP without unsafe-eval');
    assert.equal(report.rows.length,selected.length);
    for(const row of report.rows){
      assert.equal(row.emitted,row.native,
        'Browser original vs emitted host observation diverged at '+CARRIERS[selected[row.index]][0]);
      assert.deepEqual(JSON.parse(row.native),{
        outcome:7,
        trace:[{keys:['otherField','secretField'],secret:41,other:13,own:true,descriptor:41}]
      },'The browser host-callback probe must be nonvacuous');
    }
    assert.deepEqual(report.logs,['[41,13]','[41,13]'],
      'The browser must preserve output with two actual renamed fields');
    assert.equal(requests,selected.length*2*3+4,
      'Every original and emitted module including positive control must load over HTTP');
    process.stdout.write('HOST_CARRIER_BROWSER '+
      JSON.stringify({cases:selected.length,servedModules:requests,positiveProperties:2,strictCsp,evalBlocked:true,
        chrome:await browser.version()})+'\n');
  } finally {
    try{if(browser)await browser.close();}
    finally{
      await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve(true)));
    }
  }
});
