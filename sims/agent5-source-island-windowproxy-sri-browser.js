'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {createHash}=require('node:crypto');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src/core');

const runBrowser=promisify(execFile);

/** @typedef {import('../src/core').SourceFile} SourceFile */

/**
 * The external HTML harness itself is not part of the selected ESM group.
 * The declared entry is: it imports a selected pure primitive leaf, then
 * obtains the browser Document using a WindowProxy root. A parser-inserted
 * SRI-pinned link observes the selected leaf's exact HTTP response bytes.
 * There is no injected Function/require/fetch/globalThis/window/document
 * identifier, source-file API, or opaque computed member in the declared AST.
 *
 * @param {'windowproxy'|'dynamic'|'reflected'|'computedSetter'|'reflectSet'|'objectAssign'|'hostData'} [scenario]
 * @returns {SourceFile[]}
 */
function originalFiles(scenario='windowproxy'){
  const leaf='const record={privateField:23};const value=record.privateField;export function leaf(){return value;}';
  const sri='sha256-'+createHash('sha256').update(leaf).digest('base64');
  const markup='<link id="sri-probe" rel="modulepreload" href="./leaf.mjs?integrity=1" integrity="'+sri+'">';
  const insertion=scenario==='hostData' ?
    [
      "const stagedLink=doc.createElement('link');",
      "stagedLink.id='sri-probe';",
      "stagedLink.rel='modulepreload';",
      "stagedLink.href='./leaf.mjs?integrity=1';",
      "const field=doc.body.dataset.pinKey;",
      "stagedLink[field]=doc.body.dataset.pinValue;",
      "doc.head.append(stagedLink);"
    ].join('\n') :
    scenario==='dynamic' ?
    "const selector=['insert','AdjacentHTML'].join('');doc.head[selector]('beforeend',"+JSON.stringify(markup)+");" :
    scenario==='reflected' ?
      "const insert=doc.head.insertAdjacentHTML;Reflect.apply(insert,doc.head,['beforeend',"+JSON.stringify(markup)+"]);" :
      scenario==='computedSetter' ?
        "const selector=['inner','HTML'].join('');doc.head[selector]="+JSON.stringify(markup)+";" :
      scenario==='reflectSet' ?
        [
          "const runtimeHtml='<link id=\"sri-probe\" rel=\"modulepreload\" href=\"./leaf.mjs?integrity=1\" integrity=\"'+doc.body.dataset.pinValue+'\">';",
          'Reflect.set(doc.head,"innerHTML",runtimeHtml);'
        ].join('\n') :
      scenario==='objectAssign' ?
        [
          "const runtimeHtml='<link id=\"sri-probe\" rel=\"modulepreload\" href=\"./leaf.mjs?integrity=1\" integrity=\"'+doc.body.dataset.pinValue+'\">';",
          'Object.assign(doc.head,{innerHTML:runtimeHtml});'
        ].join('\n') :
        'doc.head.insertAdjacentHTML("beforeend",'+JSON.stringify(markup)+');';
  const entry=[
    "import {leaf} from './leaf.mjs';",
    'const value=leaf();',
    scenario==='windowproxy' ? "const doc=top['document'];" :
      scenario==='hostData' ? "const doc=window.top['document'];" :
      'const doc=document;',
    insertion,
    "const link=doc.getElementById('sri-probe');",
    "const display=result=>{const el=doc.createElement('pre');el.id='result';el.textContent=value+':'+result;doc.body.appendChild(el);};",
    "link.addEventListener('load',()=>display('load'),{once:true});",
    "link.addEventListener('error',()=>display('error'),{once:true});"
  ].join('\n');
  return [
    {path:'leaf.mjs',sourceType:'module',code:leaf},
    {path:'entry.mjs',sourceType:'module',code:entry}
  ];
}

/**
 * Browser module graph served with proper JS MIME and no cache, so the
 * integrity result cannot be a file://, data: URL, MIME or network artifact.
 * @returns {Promise<{origin:string,close:()=>Promise<void>}>}
 */
async function serve(){
  const scenario=process.argv.includes('--dynamic-selector')?'dynamic':
    process.argv.includes('--reflective-insert')?'reflected':
    process.argv.includes('--computed-setter')?'computedSetter':
    process.argv.includes('--reflect-set')?'reflectSet':
    process.argv.includes('--object-assign')?'objectAssign':
    process.argv.includes('--host-data-sri')?'hostData':'windowproxy';
  const original=originalFiles(scenario);
  // This script is deliberately dual-use. On the red-first source, run it
  // without flags to prove native-vs-generated SRI mismatch. After the
  // admission repair, --expect-guarded verifies both the island refusal and
  // byte-preserving default-mode output against real Chromium.
  const expectGuarded=process.argv.includes('--expect-guarded');
  if(expectGuarded && scenario==='windowproxy') {
    assert.throws(()=>obfuscateFiles(original,{
      mode:'coo',closedWorld:true,seed:'agent5-windowproxy-sri-real-browser',
      strings:false,identifiers:false,
      experimentalSourceObserverIslands:['leaf.mjs']
    }),/source|loader|opaque|island/i,'experimental island must refuse browser source observer');
  }
  const compiled=obfuscateFiles(original,{
    mode:'coo',closedWorld:true,seed:'agent5-windowproxy-sri-real-browser',
    strings:false,identifiers:false,
    ...(expectGuarded||scenario!=='windowproxy'?{}:
      {experimentalSourceObserverIslands:['leaf.mjs']})
  });
  const leaf=compiled.files.find(file=>file.path==='leaf.mjs');
  assert.ok(leaf && typeof leaf.code==='string');
  if(expectGuarded) {
    assert.equal(leaf.metrics.properties,0,'default source observer must suppress rewrite');
    assert.equal(leaf.code,original[0].code,'byte-pin requires exact emitted JS source');
  } else {
    assert.ok(leaf.metrics.properties>=1,'red-first test needs a real property rewrite');
    assert.notEqual(leaf.code,original[0].code,'test needs different protected bytes');
  }

  /** @type {Map<string,string>} */
  const files=new Map();
  const graphs=[
    ['original',original],
    ['emitted',compiled.files],
    ['tampered',original.map(file=>file.path==='leaf.mjs' ?
      {...file,code:String(file.code)+'/* change bytes without changing behavior */'} : file)]
  ];
  const trustedPin='sha256-'+createHash('sha256')
    .update(String(original[0].code)).digest('base64');
  for(const [folder,group] of graphs){
    for(const file of group)files.set('/'+folder+'/'+file.path,String(file.code));
    const bodyOpen=['hostData','reflectSet','objectAssign'].includes(scenario) ?
      '<body data-pin-key="integrity" data-pin-value="'+trustedPin+'">' :
      '<body>';
    files.set('/'+folder+'/index.html',
      '<!doctype html><html><head></head>'+bodyOpen+
      '<script type="module" src="./entry.mjs"></script></body></html>');
  }
  const server=http.createServer((request,response)=>{
    const path=new URL(request.url??'/','http://127.0.0.1').pathname;
    const code=files.get(path);
    if(code===undefined){response.writeHead(404).end();return;}
    response.writeHead(200,{
      'Content-Type':path.endsWith('.html') ?
        'text/html; charset=utf-8' : 'text/javascript; charset=utf-8',
      'Cache-Control':'no-store',
      'X-Content-Type-Options':'nosniff'
    });
    response.end(code);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  const address=server.address();
  assert.ok(address && typeof address!=='string');
  return {
    origin:'http://127.0.0.1:'+address.port,
    close:()=>new Promise(resolve=>server.close(()=>resolve()))
  };
}

/** @param {string} url @returns {Promise<string>} */
async function observedState(url) {
  const binary=process.env.CHROMIUM_BIN??'google-chrome';
  const {stdout}=await runBrowser(binary,[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=10000','--dump-dom',url
  ],{timeout:45000,maxBuffer:5*1024*1024,encoding:'utf8'});
  const match=stdout.match(/<pre id="result">([^<]*)<\/pre>/u);
  assert.ok(match,'browser integrity probe did not settle: '+url+' '+stdout.slice(0,1600));
  return match[1];
}

/**
 * @returns {Promise<void>}
 */
async function main(){
  const server=await serve();
  try {
    const states=/** @type {Record<string,string>} */({});
    for(const folder of ['original','tampered','emitted']){
      states[folder]=await observedState(server.origin+'/'+folder+'/index.html');
    }
    assert.equal(states.original,'23:load','intact SRI positive control');
    assert.equal(states.tampered,'23:error','SRI mismatch negative control');
    console.log('AGENT5_WINDOWPROXY_SRI '+JSON.stringify(states));
    assert.equal(states.emitted,states.original,
      'compiler must not change ESM bytes that the declared entry SRI-checks');
  }finally{
    await server.close();
  }
}

if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main,originalFiles};
