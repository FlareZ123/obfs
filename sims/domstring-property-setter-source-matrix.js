'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

/**
 * @typedef {{name:string,setup:string,target:string,property:string}} SetterCase
 */

/** @type {SetterCase[]} */
const cases=[
  {name:'Document.title',setup:'',target:'document',property:'title'},
  {name:'HTMLElement.id',setup:'const target=document.createElement("div");',target:'target',property:'id'},
  {name:'HTMLElement.title',setup:'const target=document.createElement("div");',target:'target',property:'title'},
  {name:'HTMLElement.lang',setup:'const target=document.createElement("div");',target:'target',property:'lang'},
  {name:'HTMLElement.slot',setup:'const target=document.createElement("div");',target:'target',property:'slot'},
  {name:'HTMLElement.className',setup:'const target=document.createElement("div");',target:'target',property:'className'},
  {name:'Node.textContent',setup:'const target=document.createElement("div");',target:'target',property:'textContent'},
  {name:'HTMLInputElement.value',setup:'const target=document.createElement("input");',target:'target',property:'value'},
  {name:'HTMLInputElement.placeholder',setup:'const target=document.createElement("input");',target:'target',property:'placeholder'},
  {name:'HTMLInputElement.name',setup:'const target=document.createElement("input");',target:'target',property:'name'},
  {name:'HTMLTextAreaElement.value',setup:'const target=document.createElement("textarea");',target:'target',property:'value'},
  {name:'HTMLImageElement.alt',setup:'const target=document.createElement("img");',target:'target',property:'alt'},
  {name:'HTMLIFrameElement.name',setup:'const target=document.createElement("iframe");',target:'target',property:'name'},
  {name:'HTMLScriptElement.text',setup:'const target=document.createElement("script");',target:'target',property:'text'},
  {name:'HTMLLabelElement.htmlFor',setup:'const target=document.createElement("label");',target:'target',property:'htmlFor'},
  {name:'HTMLAnchorElement.download',setup:'const target=document.createElement("a");',target:'target',property:'download'},
  {name:'HTMLButtonElement.name',setup:'const target=document.createElement("button");',target:'target',property:'name'},
  {name:'HTMLOptionElement.label',setup:'const target=document.createElement("option");',target:'target',property:'label'},
  {name:'HTMLOptionElement.value',setup:'const target=document.createElement("option");',target:'target',property:'value'},
  {name:'HTMLFormElement.name',setup:'const target=document.createElement("form");',target:'target',property:'name'}
];

/**
 * @param {SetterCase} item
 * @param {boolean} primitive
 * @returns {string}
 */
function sourceForCase(item,primitive) {
  const lines=[];
  if(primitive) {
    lines.push('const independent={independentSecret:73};');
    if(item.setup)lines.push(item.setup);
    lines.push(item.target+'.'+item.property+'="literal";');
    lines.push('export const observed={source:'+item.target+'.'+item.property+
      ',independent:independent.independentSecret};');
  } else {
    lines.push('const observedOwner={secretField:57};');
    lines.push('function inspect(){return observedOwner.secretField;}');
    lines.push('const independent={independentSecret:73};');
    if(item.setup)lines.push(item.setup);
    lines.push(item.target+'.'+item.property+'=inspect;');
    lines.push('export const observed={source:'+item.target+'.'+item.property+
      ',value:inspect(),independent:independent.independentSecret};');
  }
  return lines.join('\n');
}

/**
 * @param {string} code
 * @param {string} seed
 * @returns {{code:string,properties:number}}
 */
function compile(code,seed) {
  const result=obfuscateFiles([{path:'case.mjs',sourceType:'module',code}],{
    mode:'coo',seed,closedWorld:true,
    properties:true,identifiers:true,strings:false
  });
  const file=result.files[0];
  return {code:/** @type {string} */(file.code),
    properties:file.metrics.properties};
}

/**
 * @returns {Promise<void>}
 */
async function main() {
  const bodies=new Map();
  /** @type {{name:string,native:string,compiled:string,positiveNative:string,positiveCompiled:string,negativeProperties:number,positiveProperties:number}[]} */
  const pairs=[];
  for(let index=0;index<cases.length;index++) {
    const item=cases[index];
    const negative=sourceForCase(item,false);
    const negativeOutput=compile(negative,'domstring-property-negative-'+index);
    const positive=sourceForCase(item,true);
    const positiveOutput=compile(positive,'domstring-property-positive-'+index);
    const pair={
      name:item.name,
      native:'/native-negative-'+index+'.mjs',
      compiled:'/compiled-negative-'+index+'.mjs',
      positiveNative:'/native-positive-'+index+'.mjs',
      positiveCompiled:'/compiled-positive-'+index+'.mjs',
      negativeProperties:negativeOutput.properties,
      positiveProperties:positiveOutput.properties
    };
    pairs.push(pair);
    bodies.set(pair.native,negative);
    bodies.set(pair.compiled,negativeOutput.code);
    bodies.set(pair.positiveNative,positive);
    bodies.set(pair.positiveCompiled,positiveOutput.code);
  }

  const userlandSource=[
    'const observedOwner={secretField:57};',
    'function inspect(){return observedOwner.secretField;}',
    'const independent={independentSecret:73};',
    'const userland={id:null};',
    'userland.id=inspect;',
    'export const observed={value:userland.id(),independent:independent.independentSecret};'
  ].join('\n');
  const userlandOutput=compile(userlandSource,'domstring-property-userland-id-positive');
  bodies.set('/userland-native.mjs',userlandSource);
  bodies.set('/userland-compiled.mjs',userlandOutput.code);

  const page=[
    '<!doctype html><meta charset="utf-8"><pre id="result">pending</pre>',
    '<script type="module">',
    'const pairs='+JSON.stringify(pairs)+';',
    'try {',
    ' const rows=[];',
    ' for(const pair of pairs){',
    '  const [n,e,pn,pe]=await Promise.all([',
    '   import(pair.native),import(pair.compiled),',
    '   import(pair.positiveNative),import(pair.positiveCompiled)]);',
    '  const native=n.observed,emitted=e.observed,',
    '   positiveNative=pn.observed,positiveEmitted=pe.observed;',
    '  rows.push({name:pair.name,',
    '   nativeSourceValid:native.source.includes("observedOwner.secretField"),',
    '   sourceMismatch:native.source!==emitted.source,',
    '   nativeValue:native.value,emittedValue:emitted.value,',
    '   nativeIndependent:native.independent,emittedIndependent:emitted.independent,',
    '   numericParity:native.value===emitted.value&&native.value===57,',
    '   independentParity:native.independent===emitted.independent&&native.independent===73,',
    '   positiveParity:positiveNative.source==="literal"&&',
    '     JSON.stringify(positiveNative)===JSON.stringify(positiveEmitted),',
    '   negativeProperties:pair.negativeProperties,',
    '   positiveProperties:pair.positiveProperties});',
    ' }',
    ' const [un,ue]=await Promise.all([',
    '  import("/userland-native.mjs"),import("/userland-compiled.mjs")]);',
    ' const userland={native:un.observed,emitted:ue.observed,',
    '  parity:JSON.stringify(un.observed)===JSON.stringify(ue.observed)};',
    ' document.getElementById("result").textContent=JSON.stringify({rows,userland});',
    '}catch(error){document.getElementById("result").textContent=',
    ' "BROWSER_ERROR "+String(error.stack||error);}',
    '</script>'
  ].join('\n');
  bodies.set('/',page);

  const server=http.createServer((request,response)=>{
    const code=bodies.get(request.url??'');
    if(code===undefined){response.writeHead(404);response.end();return;}
    response.writeHead(200,{'Content-Type':request.url==='/'?
      'text/html; charset=utf-8':'text/javascript; charset=utf-8',
      'Cache-Control':'no-store'});
    response.end(code);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen({port:0,host:'127.0.0.1'},()=>resolve(undefined));
  });
  try {
    const address=server.address();
    if(!address||typeof address==='string')throw Error('Expected loopback port');
    const {stdout,stderr}=await promisify(execFile)(
      process.env.CHROMIUM_BIN??'google-chrome',[
        '--headless','--no-sandbox','--disable-gpu',
        '--disable-dev-shm-usage','--no-first-run',
        '--virtual-time-budget=10000','--dump-dom',
        'http://127.0.0.1:'+address.port+'/'
      ],{timeout:60000,maxBuffer:16*1024*1024,encoding:'utf8'});
    const match=stdout.match(/<pre id="result">([\s\S]*?)<\/pre>/u);
    assert.ok(match,'Chromium did not emit the result node: '+stderr);
    assert.ok(!match[1].startsWith('BROWSER_ERROR '),match[1]);
    const browser=JSON.parse(match[1]);
    const rows=browser.rows;
    const allExpectedRed=rows.length===cases.length&&rows.every(
      (/** @type {any} */ row)=>row.nativeSourceValid&&row.sourceMismatch&&
        row.numericParity&&row.independentParity&&row.positiveParity&&
        row.negativeProperties>=1&&row.positiveProperties>=1);
    const userland=browser.userland;
    const userlandPositive=userland.parity&&userland.native.value===57&&
      userland.emitted.value===57&&userland.native.independent===73&&
      userland.emitted.independent===73&&userlandOutput.properties>=1;
    const summary={
      expectedRedReproduced:allExpectedRed&&userlandPositive,
      sinkCount:rows.length,
      sourceMismatchCount:rows.filter((/** @type {any} */ row)=>row.sourceMismatch).length,
      sourceMismatchNames:rows.filter((/** @type {any} */ row)=>row.sourceMismatch).map(
        (/** @type {any} */ row)=>row.name),
      rows,userland,
      userlandProperties:userlandOutput.properties
    };
    fs.writeFileSync('domstring-property-setter-matrix.json',
      JSON.stringify(summary,null,2)+'\n');
    process.stdout.write('DOMSTRING_PROPERTY_SETTER_MATRIX '+
      JSON.stringify(summary)+'\n');
    assert.equal(summary.expectedRedReproduced,true,
      'Expected native source-observation mismatches and independent positives were not reproduced');
    process.stdout.write('DOMSTRING_PROPERTY_SETTER_MATRIX_EXPECTED_RED PASS\n');
  } finally {
    await new Promise(resolve=>server.close(()=>resolve(undefined)));
  }
}

if(require.main===module)main().catch(error=>{
  console.error(error);
  process.exitCode=1;
});
module.exports={main};
