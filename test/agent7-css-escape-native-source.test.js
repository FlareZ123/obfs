'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {parse,observesFunctionSource}=require('../src/ast');
const {obfuscateFiles}=require('../src/core');

/**
 * The CSSOM CSS.escape operation converts its argument to a DOMString.
 * For a native function this exposes the exact Function#toString bytes.
 * These fixture variants also test static alias propagation.
 */
const cases=[
  {name:'direct',declarations:'',expression:'CSS.escape(protectedFn)'},
  {name:'global',declarations:'',expression:'globalThis.CSS.escape(protectedFn)'},
  {name:'namespace alias',declarations:'const C=CSS;',expression:'C.escape(protectedFn)'},
  {name:'destructured method',declarations:'const {escape:esc}=CSS;',expression:'esc(protectedFn)'},
  {name:'method alias',declarations:'const esc=CSS.escape;',expression:'esc(protectedFn)'}
];

/**
 * @param {string} declarations
 * @param {string} expression
 * @returns {string}
 */
function build(declarations,expression) {
  return [
    'const owner={privateSlot:41,extraSlot:1};',
    'function protectedFn(secretArg){return secretArg+owner.privateSlot+owner.extraSlot;}',
    declarations,
    'const text='+expression+';',
    'const value=protectedFn(0);',
    'document.getElementById("out").textContent=JSON.stringify({text,value});'
  ].join('\n');
}

/**
 * @param {Map<string,string>} scripts
 * @returns {Promise<{url:string,close:()=>Promise<void>}>}
 */
async function createServer(scripts) {
  const server=http.createServer((request,response)=>{
    const pathname=new URL(request.url??'/','http://localhost').pathname;
    const match=/^\/(native|coo|sco)\/(entry\.js|index\.html)$/u.exec(pathname);
    if(!match || request.method!=='GET'){response.writeHead(404).end();return;}
    if(match[2]==='index.html') {
      response.writeHead(200,{'content-type':'text/html; charset=utf-8',
        'content-security-policy':"default-src 'none'; script-src 'self'",
        'cache-control':'no-store'});
      response.end('<!doctype html><meta charset="utf-8"><pre id="out">pending</pre>'+
        '<script src="/'+match[1]+'/entry.js"></script>');
      return;
    }
    response.writeHead(200,{'content-type':'text/javascript; charset=utf-8',
      'cache-control':'no-store'});
    response.end(scripts.get(match[1])??'');
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);server.listen(0,'127.0.0.1',resolve);
  });
  const addr=server.address();
  if(!addr || typeof addr==='string')throw new Error('Expected TCP listener');
  return {url:'http://127.0.0.1:'+addr.port,
    close:()=>new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()))};
}

/**
 * @param {string} url
 * @returns {Promise<{text:string,value:number}>}
 */
async function browser(url) {
  const {stdout}=await promisify(execFile)(process.env.CHROMIUM_BIN??'google-chrome',[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=2000','--dump-dom',url
  ],{encoding:'utf8',timeout:45000,maxBuffer:4*1024*1024,windowsHide:true});
  const match=stdout.match(/<pre id="out">([^<]+)<\/pre>/u);
  assert.ok(match,'Chromium did not render: '+stdout.slice(-1200));
  return /** @type {{text:string,value:number}} */(JSON.parse(match[1]));
}

/**
 * Native CSSOM string conversion can be represented by an untransformed
 * embedding host, which allows SCO/COO/SNO to share a Node differential.
 * This is a source coercion model, not a substitute for the Chromium test.
 * @param {string} source
 * @returns {string}
 */
function executeNodeHost(source) {
  const host={escape:/** @param {unknown} value */ value=>String(value)};
  const module={exports:/** @type {unknown} */(null)};
  new Function('module','CSS',source)(module,host);
  return JSON.stringify(module.exports);
}

test('untransformed native-like CSS.escape host preserves function source across all modes',()=>{
  for(const item of cases) {
    // Only the direct and local-alias forms are portable to Node's
    // intentionally minimal host object; globalThis.CSS requires the browser.
    if(['global','destructured global namespace'].includes(item.name))continue;
    const source='const owner={privateSlot:41,extraSlot:1};'+
      'function protectedFn(secretArg){return secretArg+owner.privateSlot+owner.extraSlot;}'+
      item.declarations+
      'module.exports=['+item.expression+',protectedFn(0)];';
    const expected=executeNodeHost(source);
    assert.ok(expected.includes('secretArg'),item.name+' must expose original spelling');
    for(const mode of /** @type {const} */(['coo','sno','sco'])) {
      const compiled=obfuscateFiles([{
        path:'css-host.cjs',sourceType:'commonjs',code:source
      }],{mode,seed:'css-node-source/'+item.name+'/'+mode,
        closedWorld:true,properties:true,strings:false,identifiers:true});
      assert.equal(executeNodeHost(String(compiled.files[0].code)),expected,
        mode+' '+item.name+' untransformed host source parity');
    }
  }
});

test('inert CSS.escape preserves unrelated lexical identifier rewrite yield',()=>{
  const source='function privateFn(privateArg){return privateArg+1;}'+
    'CSS.escape("literal-input");module.exports=privateFn(41);';
  for(const mode of /** @type {const} */(['coo','sno','sco'])) {
    const compiled=obfuscateFiles([{
      path:'css-primitive.cjs',sourceType:'commonjs',code:source
    }],{mode,seed:'css-node-lexical-control/'+mode,closedWorld:true,
      properties:false,strings:false,identifiers:true});
    assert.ok(compiled.files[0].metrics.bindings>0,
      mode+' must retain at least one provably private lexical rewrite');
    assert.equal(executeNodeHost(String(compiled.files[0].code)),
      executeNodeHost(source));
  }
});

test('CSSOM native function-string coercion is recognized across static aliases',()=>{
  for(const item of cases) {
    const src=build(item.declarations,item.expression);
    assert.equal(observesFunctionSource(parse(src,'script')),true,
      'Must conservatively track '+item.name+' native source read');
  }
});

test('inert CSS.escape primitive arguments retain private owner property yield',()=>{
  const source='const owner={privateSlot:41,extraSlot:1};'+
    'const safe=CSS.escape("literal-key");'+
    'module.exports=owner.privateSlot+owner.extraSlot;';
  assert.equal(observesFunctionSource(parse(source,'commonjs')),false);
  for(const mode of /** @type {const} */(['coo','sno','sco'])) {
    const out=obfuscateFiles([{path:'primitive-css.cjs',sourceType:'commonjs',code:source}],{
      mode,seed:'css-native-primitive-'+mode,closedWorld:true,
      properties:true,strings:false,identifiers:false
    });
    assert.ok(out.files[0].metrics.properties>=2,
      mode+' must retain positive property rewrite yield');
  }
});

test('real Chromium CSS.escape observes exact source bytes in all three modes',
  {skip:process.platform!=='linux' && !process.env.CHROMIUM_BIN},
  async()=>{
    for(const item of cases) {
      const source=build(item.declarations,item.expression);
      const scripts=new Map([['native',source]]);
      for(const mode of /** @type {const} */(['coo','sco'])) {
        const result=obfuscateFiles([{path:'entry.js',sourceType:'script',code:source}],{
          mode,seed:'css-native-'+item.name+'-'+mode,closedWorld:true,
          properties:true,strings:false,identifiers:true
        });
        scripts.set(mode,/** @type {string} */(result.files[0].code));
      }
      const server=await createServer(scripts);
      try {
        const original=await browser(server.url+'/native/index.html');
        assert.equal(original.value,42);
        assert.ok(original.text.includes('secretArg') && original.text.includes('privateSlot'),
          'Native CSS.escape must expose the original function bytes: '+
          JSON.stringify(original));
        for(const mode of ['coo','sco']) {
          const emitted=await browser(server.url+'/'+mode+'/index.html');
          assert.deepEqual(emitted,original,
            mode+' '+item.name+' must preserve source-sensitive CSSOM behavior');
        }
      }finally{await server.close();}
    }
  });
