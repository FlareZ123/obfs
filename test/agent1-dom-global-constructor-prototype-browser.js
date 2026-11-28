'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {once}=require('node:events');
const puppeteer=require('puppeteer-core');
const {obfuscateFiles}=require('../src');

const clientSource='globalThis._targetLiteral="the independent client payload must retain its original runtime value";';
const bootstrapSource=[
  'const value=document.createElement("script");',
  'document.head.append(value);',
  'globalThis._observedNodeText=document.head.lastChild.textContent;',
  'globalThis._nodeAnswer=typeof value==="function"?value():"native node";',
  'globalThis._ready=true;'
].join('\n');
const replacement='function replacedFactory(){return function inspected(){'+
  'const privateToken="function source is a browser-observed DOMString";'+
  'return privateToken;};}';
/** @type {readonly {name:string,mutation:string}[]} */
const mutationCases=[
  {name:'global-constructor',
    mutation:'globalThis.Document.prototype.createElement='+replacement+';'},
  {name:'aliased-constructor',
    mutation:'const Doc=window.Document;Doc.prototype.createElement='+replacement+';'},
  {name:'document-constructor',
    mutation:'document.constructor.prototype.createElement='+replacement+';'},
  {name:'prototype-chain',
    mutation:'Object.getPrototypeOf(document).__proto__.createElement='+replacement+';'}
];

/** @param {string} code @param {'coo'|'sco'|'sno'} mode */
function compile(code,mode) {
  return obfuscateFiles([
    {path:'client.js',sourceType:'script',code:clientSource},
    {path:'mutation.js',sourceType:'script',code},
    {path:'bootstrap.js',sourceType:'script',code:bootstrapSource}
  ],{mode,seed:'agent1-document-constructor-browser/'+mode,
    strings:true,properties:false,identifiers:false});
}

/**
 * Genuine Chromium invokes Web IDL Node-or-DOMString conversion for an
 * Element.append operand. A factory replaced with a function-returning
 * callable takes the DOMString arm and leaks the exact callable source.
 * This exercises both runtime source parity and independently required
 * non-SRI protection yield for an unmodified native factory.
 */
async function main(){
  /** @type {Map<string,{type:string,body:string}>} */
  const routes=new Map();
  /** @type {{name:string,mode:string,root:string,mutated:boolean}[]} */
  const inventory=[];
  for(const item of [
    ...mutationCases,
    {name:'native-positive',mutation:''}
  ])for(const mode of /** @type {const} */(['coo','sco','sno'])){
    const transformed=compile(item.mutation,mode);
    const original=[clientSource,item.mutation,bootstrapSource];
    const mutated=item.mutation!=='';
    // Test-only negative comparator: execute the unpatched emission even
    // when source is already visibly rewritten. The assertion belongs in
    // the fixed-head suite; here real Chromium decides whether observable
    // DOMString function source actually differs.
    if(!mutated)assert.notEqual(String(transformed.files[0].code),clientSource,
      'Unmodified native Node insertion must preserve a positive string rewrite');
    const root='/'+item.name+'/'+mode;
    for(const variant of /** @type {const} */(['before','after'])){
      const stem=root+'/'+variant;
      const bodies=variant==='before'?original:
        transformed.files.map(file=>String(file.code));
      for(let i=0;i<3;i++)routes.set(stem+'/'+['client.js','mutation.js','bootstrap.js'][i],{
        type:'text/javascript',body:bodies[i]
      });
      routes.set(stem+'/index.html',{type:'text/html',body:[
        '<!doctype html><html><head>',
        '<script src="./client.js"></script>',
        '<script src="./mutation.js"></script>',
        '<script src="./bootstrap.js"></script>',
        '</head><body></body></html>'
      ].join('')});
    }
    inventory.push({name:item.name,mode,root,mutated});
  }
  const server=http.createServer((req,res)=>{
    const route=routes.get(req.url??'');
    if(!route){res.writeHead(404);res.end('missing');return;}
    res.writeHead(200,{
      'content-type':route.type+'; charset=utf-8',
      'content-security-policy':"default-src 'none'; script-src 'self'",
      'x-content-type-options':'nosniff','cache-control':'no-store'
    });
    res.end(route.body);
  });
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const address=server.address();
  assert.ok(address&&typeof address!=='string');
  /** @type {import('puppeteer-core').Browser|null} */
  let browser=null;
  try{
    browser=await puppeteer.launch({
      executablePath:process.env.CHROMIUM_BIN||'/usr/bin/google-chrome',
      headless:true,args:['--no-sandbox','--disable-dev-shm-usage']
    });
    /** @param {string} url */
    async function visit(url){
      const page=await /** @type {import('puppeteer-core').Browser} */(browser).newPage();
      try{
        await page.goto('http://127.0.0.1:'+address.port+url,{waitUntil:'load'});
        await page.waitForFunction('globalThis._ready===true',{timeout:6000});
        return await page.evaluate(()=>{
          const state=/** @type {typeof globalThis & {
            _targetLiteral?:string,_observedNodeText?:string,_nodeAnswer?:string
          }} */ (globalThis);
          return {target:state._targetLiteral,text:state._observedNodeText,
            answer:state._nodeAnswer};
        });
      }finally{await page.close();}
    }
    for(const item of inventory){
      const native=await visit(item.root+'/before/index.html');
      const emitted=await visit(item.root+'/after/index.html');
      assert.equal(native.target,
        'the independent client payload must retain its original runtime value');
      if(item.mutated) {
        assert.ok(native.text?.includes('function inspected()'),
          'The browser did not actually observe a callable via DOMString');
        assert.equal(native.answer,'function source is a browser-observed DOMString');
      } else assert.equal(native.answer,'native node');
      process.stdout.write('DOM_CONSTRUCTOR_ALIAS_BROWSER '+JSON.stringify({
        name:item.name,mode:item.mode,mutated:item.mutated,
        nativeSourceLength:native.text?.length,
        emittedSourceLength:emitted.text?.length,
        parity:JSON.stringify(native)===JSON.stringify(emitted)
      })+'\n');
      assert.deepEqual(emitted,native,'Native source parity changed: '+item.name+'/'+item.mode);
    }
  }finally{
    if(browser)await browser.close();
    server.close();
    await once(server,'close');
  }
}

if(require.main===module){
  main().catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={main};
