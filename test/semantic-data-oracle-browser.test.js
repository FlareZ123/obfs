'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

/** @typedef {'plain'|'payload'|'escape'|'escape-mutate'} Scenario */
/** @typedef {'coo'|'sno'|'sco'} Mode */
/** @type {Scenario[]} */
const scenarios=['plain','payload','escape','escape-mutate'];
/** @type {Mode[]} */
const modes=['coo','sno','sco'];

/**
 * The trusted HTML and observer code are deliberately not part of the input
 * group. The tested ESM graph has only a literal private owner and a public
 * shared value, so actual positive private rewrites can be asserted.
 * @param {Scenario} scenario
 * @returns {{path:string,sourceType:'module',code:string}[]}
 */
function graph(scenario){
  let use="import {state,shared} from './state.mjs';\n";
  if(scenario==='payload')use+=
    "globalThis.externalObserver('before',state.privateAlpha,shared,-0,0/0);\n"+
    "globalThis.externalObserver('after',state.privateBeta,shared,-0,0/0);\n";
  if(scenario==='escape'||scenario==='escape-mutate')
    use+="globalThis.externalObserver(state);\n";
  use+="export const result=[state.privateAlpha,state.privateAlpha,"+
    "state.privateBeta,shared,shared,-0,0/0];\n";
  return [
    {path:'state.mjs',sourceType:'module',
      code:'export const shared={publicValue:-0};'+
        'export const state={privateAlpha:23,privateBeta:7};'},
    {path:'entry.mjs',sourceType:'module',code:use}
  ];
}

/**
 * An independent, untransformed browser host observes callbacks and module
 * outputs. Object.is checks expose negative zero and NaN which JSON alone loses.
 * The observed ESM modules do not contain or control this host script.
 * @returns {string}
 */
function hostRunner(){
  return [
    'const scenarios='+JSON.stringify(scenarios)+';',
    'const variants='+JSON.stringify(['native',...modes])+';',
    'async function run(){',
    'const rows=[];',
    'for(const scenario of scenarios){',
    'for(const variant of variants){',
    'const raw=[];',
    'globalThis.externalObserver=(...args)=>{',
    'if(scenario==="escape"||scenario==="escape-mutate"){',
    'const owner=args[0];',
    'raw.push({kind:"owner",data:{keys:Object.keys(owner),',
    'alpha:owner.privateAlpha,beta:owner.privateBeta,',
    'betaIsNegativeZero:Object.is(owner.privateBeta,-0)}});',
    'if(scenario==="escape-mutate"){owner.privateAlpha=11;owner.privateBeta=-0;}',
    '}else raw.push({kind:"payload",values:args});',
    '};',
    'const mod=await import("/"+scenario+"/"+variant+"/entry.mjs");',
    'const result=mod.result;',
    'const events=raw.map(item=>item.kind==="owner"?item.data:{',
    'tag:item.values[0],alpha:item.values[1],',
    'sharedIdentity:item.values[2]===result[3],',
    'negativeZero:Object.is(item.values[3],-0),',
    'notANumber:Number.isNaN(item.values[4])});',
    'const data={alpha:result[0],duplicate:Object.is(result[0],result[1]),',
    'beta:result[2],betaIsNegativeZero:Object.is(result[2],-0),',
    'aliases:result[3]===result[4],',
    'sharedIsNegativeZero:Object.is(result[3].publicValue,-0),',
    'exactZero:Object.is(result[5],-0),exactNaN:Number.isNaN(result[6]),events};',
    'rows.push({scenario,variant,data});',
    '}}',
    'const pre=document.getElementById("result");',
    'pre.textContent=btoa(JSON.stringify(rows));',
    '}',
    'run().catch(error=>{',
    'const pre=document.getElementById("result");',
    'pre.textContent="ERROR:"+String(error.stack||error);',
    '});'
  ].join('\n');
}

/** @param {Scenario} scenario @returns {unknown} */
function expected(scenario){
  /** @type {unknown[]} */
  const events=[];
  if(scenario==='payload')events.push(
    {tag:'before',alpha:23,sharedIdentity:true,negativeZero:true,notANumber:true},
    {tag:'after',alpha:7,sharedIdentity:true,negativeZero:true,notANumber:true}
  );
  if(scenario==='escape'||scenario==='escape-mutate')events.push({
    keys:['privateAlpha','privateBeta'],alpha:23,beta:7,betaIsNegativeZero:false
  });
  const mutation=scenario==='escape-mutate';
  return {
    alpha:mutation?11:23,duplicate:true,
    beta:mutation?0:7,betaIsNegativeZero:mutation,
    aliases:true,sharedIsNegativeZero:true,exactZero:true,exactNaN:true,events
  };
}

test('real Chromium out-of-graph host sees exact cross-file COO/SNO/SCO behavior',{
  skip:process.platform==='win32'
},async()=>{
  /** @type {Map<string,string>} */
  const sourceByRoute=new Map();
  /** @type {Array<{scenario:Scenario,mode:Mode,rewritten:number}>} */
  const yields=[];
  for(const scenario of scenarios){
    const native=graph(scenario);
    for(const file of native)
      sourceByRoute.set('/'+scenario+'/native/'+file.path,file.code);
    for(const mode of modes){
      const built=obfuscateFiles(native,{
        mode,closedWorld:true,properties:true,strings:false,identifiers:false,
        seed:'browser-exact-host-graph/'+scenario+'/'+mode
      });
      yields.push({scenario,mode,rewritten:built.crossFile.properties});
      if(scenario==='plain')
        assert.ok(built.crossFile.properties>=1,
          scenario+'/'+mode+': actual private-field rewrite required');
      if(scenario==='escape'||scenario==='escape-mutate')
        assert.equal(built.crossFile.properties,0,
          scenario+'/'+mode+': externally escaped owner must not be renamed');
      for(const file of built.files){
        assert.equal(typeof file.code,'string');
        sourceByRoute.set('/'+scenario+'/'+mode+'/'+file.path,
          /** @type {string} */(file.code));
      }
    }
  }
  const html='<!doctype html><html><head><meta charset="utf-8">'+
    '<script type="module" src="/runner.mjs"></script></head>'+
    '<body><pre id="result">pending</pre></body></html>';
  const runner=hostRunner();
  const server=http.createServer((request,response)=>{
    if(request.method!=='GET'){response.writeHead(405).end();return;}
    const pathname=new URL(request.url??'/','http://localhost').pathname;
    if(pathname==='/'){
      response.writeHead(200,{'content-type':'text/html; charset=utf-8',
        'content-security-policy':"default-src 'none'; script-src 'self'; connect-src 'self'"});
      response.end(html);
      return;
    }
    const source=pathname==='/runner.mjs'?runner:sourceByRoute.get(pathname);
    if(source===undefined){response.writeHead(404).end();return;}
    response.writeHead(200,{'content-type':'text/javascript; charset=utf-8',
      'cache-control':'no-store','x-content-type-options':'nosniff'});
    response.end(source);
  });
  try {
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',()=>resolve(undefined));
    });
    const addr=server.address();
    if(!addr||typeof addr==='string')throw new Error('missing local browser origin');
    const {stdout}=await promisify(execFile)(process.env.CHROMIUM_BIN??'google-chrome',[
      '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
      '--no-first-run','--virtual-time-budget=20000','--dump-dom',
      'http://127.0.0.1:'+addr.port+'/'
    ],{encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024});
    const match=stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u);
    assert.ok(match,'Browser host runner failed: '+stdout.slice(0,1900));
    const rows=/** @type {Array<{scenario:Scenario,variant:string,data:unknown}>} */(
      JSON.parse(Buffer.from(match[1],'base64').toString('utf8')));
    assert.equal(rows.length,scenarios.length*(modes.length+1));
    for(let i=0;i<scenarios.length;i++){
      const group=rows.slice(i*(modes.length+1),(i+1)*(modes.length+1));
      assert.deepEqual(group.map(row=>row.variant),['native',...modes]);
      const independent=expected(scenarios[i]);
      assert.deepEqual(group[0].data,independent,
        scenarios[i]+': native Chromium must match independent host expectation');
      for(const row of group.slice(1)){
        assert.deepEqual(row.data,group[0].data,
          scenarios[i]+'/'+row.variant+': exact browser host-event/output parity');
      }
    }
    process.stdout.write('EXACT_HOST_CHROMIUM '+JSON.stringify({
      scenarios:scenarios.length,modes:modes.length,executions:rows.length,yields
    })+'\n');
  }finally {
    await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve(undefined)));
  }
});
