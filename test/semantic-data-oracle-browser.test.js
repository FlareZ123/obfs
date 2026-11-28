'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

/** @typedef {'plain'|'payload'|'escape'|'escape-mutate'} Scenario */
/** @typedef {'coo'|'sco'} Mode */
/** @type {Scenario[]} */
const scenarios=['plain','payload','escape','escape-mutate'];
/** @type {Mode[]} */
const modes=['coo','sco'];

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
    "const hostIs=Object.is;",
    "const hostNaN=Number.isNaN;",
    "const hostKeys=Object.keys;",
    "const hostHasOwn=Object.hasOwn;",
    "const hostApply=Reflect.apply;",
    "const hostPush=Array.prototype.push;",
    "const hostOwnKeys=Reflect.ownKeys;",
    "const hostDescriptor=Reflect.getOwnPropertyDescriptor;",
    "const hostPrototype=Object.getPrototypeOf;",
    "const hostIsArray=Array.isArray;",
    "const hostObjectProto=Object.prototype;",
    "const hostArrayProto=Array.prototype;",
    "const hostJSONQuote=JSON.stringify;",
    "const hostFinite=Number.isFinite;",
    "const hostInteger=Number.isSafeInteger;",
    "const hostString=String;",
    "const hostBtoa=btoa;",
    "const hostSink=document.getElementById('result');",
    "function serializeHost(value,depth){",
    "  if(depth>48)throw new Error('host observation too deep');",
    "  if(value===null)return 'null';",
    "  const type=typeof value;",
    "  if(type==='string'||type==='boolean')return hostJSONQuote(value);",
    "  if(type==='number'){",
    "    if(!hostFinite(value))throw new Error('host observation has raw nonfinite number');",
    "    return hostJSONQuote(value);",
    "  }",
    "  if(type!=='object')throw new Error('host observation has unsupported value');",
    "  const array=hostIsArray(value);",
    "  const proto=hostPrototype(value);",
    "  if(proto!==(array?hostArrayProto:hostObjectProto)&&proto!==null)",
    "    throw new Error('host observation has unsupported prototype');",
    "  const keys=hostOwnKeys(value);",
    "  if(array){",
    "    const length=hostDescriptor(value,'length')?.value;",
    "    if(!hostInteger(length)||length>10000||keys.length!==length+1)",
    "      throw new Error('host observation array shape invalid');",
    "    let result='[';",
    "    for(let i=0;i<length;i++){",
    "      const desc=hostDescriptor(value,hostString(i));",
    "      if(!desc||!hostHasOwn(desc,'value'))",
    "        throw new Error('host observation array has hole or accessor');",
    "      if(i)result+=',';",
    "      result+=serializeHost(desc.value,depth+1);",
    "    }",
    "    return result+']';",
    "  }",
    "  let result='{';",
    "  for(let i=0;i<keys.length;i++){",
    "    const key=keys[i];",
    "    if(typeof key!=='string')throw new Error('host observation symbol key');",
    "    const desc=hostDescriptor(value,key);",
    "    if(!desc||!hostHasOwn(desc,'value'))",
    "      throw new Error('host observation record has accessor');",
    "    if(i)result+=',';",
    "    result+=hostJSONQuote(key)+':'+serializeHost(desc.value,depth+1);",
    "  }",
    "  return result+'}';",
    "}",
    'async function run(){',
    'const rows=[];',
    'for(const scenario of scenarios){',
    'for(const variant of variants){',
    'const raw=[];',
    'globalThis.externalObserver=(...args)=>{',
    'if(scenario==="escape"||scenario==="escape-mutate"){',
    'const owner=args[0];',
    'hostApply(hostPush,raw,[{kind:"owner",data:{keys:hostKeys(owner),',
    'alpha:owner.privateAlpha,beta:owner.privateBeta,',
    'betaIsNegativeZero:hostIs(owner.privateBeta,-0)}}]);',
    'if(scenario==="escape-mutate"){owner.privateAlpha=11;owner.privateBeta=-0;}',
    '}else hostApply(hostPush,raw,[{kind:"payload",values:args}]);',
    '};',
    'const mod=await import("/"+scenario+"/"+variant+"/entry.mjs");',
    'const result=mod.result;',
    'const events=[];',
    'for(let i=0;i<raw.length;i++){',
    'const item=raw[i];',
    'const event=item.kind==="owner"?item.data:{',
    'tag:item.values[0],alpha:item.values[1],',
    'sharedIdentity:item.values[2]===result[3],',
    'negativeZero:hostIs(item.values[3],-0),',
    'notANumber:hostNaN(item.values[4])};',
    'hostApply(hostPush,events,[event]);',
    '}',
    'const data={alpha:result[0],duplicate:hostIs(result[0],result[1]),',
    'beta:result[2],betaIsNegativeZero:hostIs(result[2],-0),',
    'aliases:result[3]===result[4],',
    'sharedIsNegativeZero:hostIs(result[3].publicValue,-0),',
    'exactZero:hostIs(result[5],-0),exactNaN:hostNaN(result[6]),events};',
    'hostApply(hostPush,rows,[{scenario,variant,data}]);',
    '}}',
    // Mutation in the very last subject module must have poisoned globals.',
    'if(JSON.stringify(null)!=="forged" || Object.is(-0,-0)!==false ||',
    'Number.isNaN(NaN)!==false || Object.keys({a:1})[0]!=="spoofed" ||',
    '[1].push(2)!==-1 || [1].map(value=>value).length!==0)',
    'throw new Error("browser host poisoning negative control did not execute");',
    'hostSink.textContent=hostBtoa(serializeHost(rows,0));',
    '}',
    'run().catch(error=>{',
    'hostSink.textContent="ERROR:"+hostString(error.stack||error);',
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

test('real Chromium exact COO/SCO host parity survives selected intrinsic poisoning',{
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
        let source=/** @type {string} */(file.code);
        if(scenario==='escape-mutate'&&mode==='sco'&&file.path==='state.mjs'){
          // Deliberate test-only post-compile mutation in the final browser
          // variant; it poisons same-realm host intrinsics, not owner data.
          // This is a falsification control, NOT a compiler behavior claim.
          source+='\nObject.is=()=>false;Number.isNaN=()=>false;'+
            'Object.keys=()=>["spoofed"];'+
            'Array.prototype.push=()=>-1;Array.prototype.map=()=>[];'+
            'JSON.stringify=()=>"forged";'+
            'Object.prototype.toJSON=()=>({forged:true});'+
            'Array.prototype.toJSON=()=>({forged:true});\n';
        }
        sourceByRoute.set('/'+scenario+'/'+mode+'/'+file.path,source);
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
      scenarios:scenarios.length,modes:modes.length,executions:rows.length,
      hostIntrinsicPoisonControl:true,yields
    })+'\n');
  }finally {
    await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve(undefined)));
  }
});
