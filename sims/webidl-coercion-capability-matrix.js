'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

/**
 * One small executable source-observation capability matrix. Each case has
 * a native browser receiver and an independently observable result; there
 * is no static proof that all Web IDL coercion paths have been enumerated.
 * @typedef {{id:string,setup:string,write:string,read:string}} Sink
 */

/** @type {Sink[]} */
const sinks=[
  {id:'cssom-set-property',setup:'const el=document.createElement("div");',
    write:'el.style.setProperty("--observed",VALUE);',
    read:'el.style.getPropertyValue("--observed")'},
  {id:'cssom-svg-style',setup:
    'const el=document.createElementNS("http://www.w3.org/2000/svg","rect");',
    write:'el.style.setProperty("--observed",VALUE);',
    read:'el.style.getPropertyValue("--observed")'},
  {id:'cssom-stylesheet-rule',setup:
    'const sheet=new CSSStyleSheet();sheet.replaceSync(":root {}");'+
    'const rule=sheet.cssRules[0];',
    write:'rule.style.setProperty("--observed",VALUE);',
    read:'rule.style.getPropertyValue("--observed")'},
  {id:'element-set-attribute',setup:'const el=document.createElement("div");',
    write:'el.setAttribute("data-observed",VALUE);',
    read:'el.getAttribute("data-observed")'},
  {id:'css-escape',setup:'let output="";',
    write:'output=CSS.escape(VALUE);',read:'output'},
  {id:'element-id-assignment',setup:'const el=document.createElement("div");',
    write:'el.id=VALUE;',read:'el.id'},
  {id:'node-textcontent-assignment',setup:'const el=document.createElement("div");',
    write:'el.textContent=VALUE;',read:'el.textContent'},
  {id:'document-create-textnode',setup:'let node;',
    write:'node=document.createTextNode(VALUE);',read:'node.textContent'},
  {id:'document-create-comment',setup:'let node;',
    write:'node=document.createComment(VALUE);',read:'node.data'},
  {id:'element-insert-adjacent-text',setup:'const el=document.createElement("div");',
    write:'el.insertAdjacentText("afterbegin",VALUE);',read:'el.textContent'},
  {id:'element-append-text',setup:'const el=document.createElement("div");',
    write:'el.append(VALUE);',read:'el.textContent'},
  {id:'element-replace-children',setup:'const el=document.createElement("div");',
    write:'el.replaceChildren(VALUE);',read:'el.textContent'}
];

/**
 * @param {Sink} sink
 * @param {boolean} primitive
 * @returns {string}
 */
function source(sink,primitive) {
  const owner=primitive?
    'const privateState={secretField:31};const privateValue=privateState.secretField;':
    'function inspect(){const state={secretField:31};return state.secretField;}';
  return [
    owner,sink.setup,sink.write.replace('VALUE',primitive?'"literal"':'inspect'),
    'export const result={observed:('+sink.read+'),',
    'number:'+(primitive?'privateValue':'inspect()')+'};'
  ].join('\n');
}

/**
 * @param {string} code
 * @param {string} seed
 * @returns {{code:string,properties:number,bindings:number}}
 */
function compile(code,seed) {
  const result=obfuscateFiles([{path:'probe.mjs',sourceType:'module',code}],{
    mode:'coo',seed,closedWorld:true,strings:false,
    identifiers:true,properties:true
  }).files[0];
  return {
    code:/** @type {string} */(result.code),
    properties:result.metrics.properties,
    bindings:result.metrics.bindings
  };
}

/**
 * Browser probe emits all read-back values by localhost POST rather than
 * relying on HTML source parsing or browser console instrumentation.
 * @returns {Promise<void>}
 */
async function main() {
  /** @type {Map<string,string>} */
  const responses=new Map();
  /** @type {Array<{id:string,negativeProperties:number,positiveProperties:number,negativeBindings:number,positiveBindings:number}>} */
  const compileRows=[];
  /** @type {Array<{id:string,nativeNegative:string,emittedNegative:string,nativePositive:string,emittedPositive:string}>} */
  const references=[];
  for(const sink of sinks) {
    const nativeNegative=source(sink,false);
    const nativePositive=source(sink,true);
    const emittedNegative=compile(nativeNegative,'webidl/'+sink.id+'/negative');
    const emittedPositive=compile(nativePositive,'webidl/'+sink.id+'/positive');
    assert.ok(emittedPositive.properties>0 &&
      !emittedPositive.code.includes('secretField'),
      'Positive must truly rename the independent private source key: '+sink.id);
    compileRows.push({
      id:sink.id,
      negativeProperties:emittedNegative.properties,
      positiveProperties:emittedPositive.properties,
      negativeBindings:emittedNegative.bindings,
      positiveBindings:emittedPositive.bindings
    });
    const base='/'+sink.id;
    responses.set(base+'-native-negative.mjs',nativeNegative);
    responses.set(base+'-emitted-negative.mjs',emittedNegative.code);
    responses.set(base+'-native-positive.mjs',nativePositive);
    responses.set(base+'-emitted-positive.mjs',emittedPositive.code);
    references.push({
      id:sink.id,
      nativeNegative:base+'-native-negative.mjs',
      emittedNegative:base+'-emitted-negative.mjs',
      nativePositive:base+'-native-positive.mjs',
      emittedPositive:base+'-emitted-positive.mjs'
    });
  }

  /** @type {unknown} */
  let browserReport=null;
  const html=[
    '<!doctype html><meta charset="utf-8"><pre id="result">pending</pre>',
    '<script type="module">',
    'try {',
    'const refs='+JSON.stringify(references)+';',
    'const rows=await Promise.all(refs.map(async item=>{',
    'const [a,b,c,d]=await Promise.all([',
    'import(item.nativeNegative),import(item.emittedNegative),',
    'import(item.nativePositive),import(item.emittedPositive)]);',
    'return {id:item.id,native:a.result,emitted:b.result,',
    'nativePositive:c.result,emittedPositive:d.result};',
    '}));',
    'await fetch("/report",{method:"POST",headers:{"Content-Type":"application/json"},',
    'body:JSON.stringify(rows)});',
    'document.getElementById("result").textContent="PASS Web IDL sink matrix";',
    '}catch(error){document.getElementById("result").textContent=',
    '"FAIL "+String(error.stack||error);}',
    '</script>'
  ].join('\n');

  const server=http.createServer(async(request,response)=>{
    const pathname=request.url??'';
    if(request.method==='POST'&&pathname==='/report') {
      let body='';
      for await(const chunk of request)body+=String(chunk);
      browserReport=JSON.parse(body);
      response.writeHead(200,{'Content-Type':'text/plain'});
      response.end('ok');
      return;
    }
    const body=pathname==='/'?html:responses.get(pathname);
    if(body===undefined) {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200,{'Content-Type':pathname==='/'?
      'text/html; charset=utf-8':'text/javascript; charset=utf-8'});
    response.end(body);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  try {
    const address=server.address();
    if(!address||typeof address==='string')throw Error('Expected TCP port');
    const {stdout,stderr}=await promisify(execFile)(
      process.env.CHROMIUM_BIN??'google-chrome',[
        '--headless','--no-sandbox','--disable-gpu',
        '--disable-dev-shm-usage','--no-first-run',
        '--virtual-time-budget=6000','--dump-dom',
        'http://127.0.0.1:'+address.port+'/'
      ],{timeout:45000,maxBuffer:8*1024*1024,encoding:'utf8'});
    assert.match(stdout,/<pre id="result">PASS Web IDL sink matrix<\/pre>/u,stderr);
    const browserRows=/** @type {Array<{
      id:string,
      native:{observed:string,number:number},
      emitted:{observed:string,number:number},
      nativePositive:{observed:string,number:number},
      emittedPositive:{observed:string,number:number}
    }>} */(browserReport);
    assert.ok(Array.isArray(browserRows));
    assert.equal(browserRows.length,sinks.length);
    /** @type {Array<Record<string,unknown>>} */
    const summary=[];
    for(const row of browserRows) {
      const compileRow=compileRows.find(item=>item.id===row.id);
      assert.ok(compileRow,'Every browser sink must have compile metadata');
      assert.equal(row.native.number,31,row.id);
      assert.equal(row.emitted.number,31,row.id);
      assert.equal(row.nativePositive.number,31,row.id);
      assert.equal(row.emittedPositive.number,31,row.id);
      summary.push({
        nativeSourceObserved:row.native.observed.includes('secretField'),
        behaviorParity:JSON.stringify(row.native)===JSON.stringify(row.emitted),
        positiveParity:JSON.stringify(row.nativePositive)===
          JSON.stringify(row.emittedPositive),
        nativeObserved:row.native.observed,
        emittedObserved:row.emitted.observed,
        ...compileRow
      });
    }
    const cssom=summary.find(item=>item.id==='cssom-set-property');
    assert.equal(cssom?.nativeSourceObserved,true);
    assert.equal(cssom?.behaviorParity,false);
    assert.equal(cssom?.positiveParity,true);
    assert.ok(Number(cssom?.negativeProperties)>0,
      'The native source-observation witness must exercise a private rewrite');
    const version=await promisify(execFile)(
      process.env.CHROMIUM_BIN??'google-chrome',['--version'],
      {timeout:10000,encoding:'utf8'});
    process.stdout.write('WEBIDL_BROWSER_RUNTIME '+JSON.stringify({
      node:process.version,chrome:version.stdout.trim()
    })+'\n');
    process.stdout.write('WEBIDL_COERCION_MATRIX '+JSON.stringify(summary)+'\n');
  }finally {
    await new Promise(resolve=>server.close(()=>resolve(undefined)));
  }
}

if(require.main===module)main().catch(error=>{
  console.error(error);
  process.exitCode=1;
});
module.exports={main,sinks,source};
