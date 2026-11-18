'use strict';

const assert=require('node:assert/strict');
const {createServer}=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {createScoHandler}=require('../src');
const {hasCssDataImport}=require('../src/css-data-imports');

const keywords=['@import','@IMPORT',String.raw`@\69mport`,String.raw`@im\70ort`,String.raw`@i\6d port`];
const urls=[
  '"data:text/css,canary"',"'data:text/css,canary'",
  'url("data:text/css,canary")','url(data:text/css,canary)',
  String.raw`url("d\61 ata:text/css,canary")`,
  String.raw`url("da\9 ta:text/css,canary")`
];
const gaps=[' ',' /**/ ','\t','\n'];

/**
 * Execute the grammar admission corpus in actual Chromium CSSOM. Custom
 * property at-keywords should remain declaration content, independently of
 * the CSS parser used by the compiler. Observed active CSSImportRule counts
 * are diagnostic: invalid forms may be conservatively refused.
 * @returns {Promise<void>}
 */
async function main(){
  /** @type {string[]} */
  const inert=[];
  /** @type {string[]} */
  const selected=[];
  for(const keyword of keywords){
    for(const gap of gaps){
      for(const url of urls){
        const rule=keyword+gap+url+';';
        const wrapped='.widget{--payload: '+rule+' color:rgb(4,5,6)}';
        assert.equal(hasCssDataImport(rule),true,rule);
        assert.equal(hasCssDataImport(wrapped),false,wrapped);
        inert.push(wrapped);
        if(selected.length<8)selected.push(rule);
      }
    }
  }
  assert.equal(inert.length,120);
  const boot=[
    'const inert='+JSON.stringify(inert)+';',
    'const active='+JSON.stringify(selected)+';',
    'let inertAccepted=0;',
    'let activeCssom=0;',
    'for(const css of inert){',
    '  const style=document.createElement("style");',
    '  style.textContent=css;document.head.appendChild(style);',
    '  const rules=style.sheet.cssRules;',
    '  if(rules.length===1 && rules[0].type===CSSRule.STYLE_RULE',
    '      && rules[0].style.getPropertyValue("--payload").trim().startsWith("@"))',
    '    inertAccepted++;',
    '  style.remove();',
    '}',
    'for(const css of active){',
    '  const style=document.createElement("style");',
    '  style.textContent=css;document.head.appendChild(style);',
    '  if(style.sheet.cssRules[0]?.type===CSSRule.IMPORT_RULE)activeCssom++;',
    '  style.remove();',
    '}',
    'document.getElementById("out").textContent=inertAccepted+"|"+activeCssom+"|"+inert.length+"|"+active.length;'
  ].join('\n');
  /** @type {import('../src/core').SourceFile[]} */
  const files=[
    {path:'index.html',sourceType:'asset',code:
      '<!doctype html><head></head><body><pre id="out">pending</pre><script type="module" src="./boot.mjs"></script></body>'},
    {path:'boot.mjs',sourceType:'module',code:boot}
  ];
  const server=createServer(createScoHandler(files,{publicPaths:files.map(file=>file.path)}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(undefined)));
  try{
    const address=server.address();
    assert.ok(address && typeof address==='object');
    const browser=process.env.CHROMIUM_BIN??'chromium';
    const {stdout}=await promisify(execFile)(browser,[
      '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
      '--no-first-run','--virtual-time-budget=7000','--dump-dom',
      'http://127.0.0.1:'+address.port+'/obfs/index.html'
    ],{timeout:45000,maxBuffer:4*1024*1024,encoding:'utf8'});
    const observed=stdout.match(/<pre id="out">(\d+\|\d+\|\d+\|\d+)<\/pre>/u)?.[1];
    assert.ok(observed,'No CSSOM grammar result: '+stdout.slice(0,1200));
    const counts=observed.split('|').map(Number);
    assert.equal(counts[0],120,'Every inert custom-property grammar case must parse in Chromium');
    assert.equal(counts[2],120);
    assert.equal(counts[3],8);
    assert.ok(counts[1]>=1,'A positive stylesheet import must parse as a browser import');
    process.stdout.write('Chromium CSSOM grammar matrix inert='+counts[0]+
      '/120, positive imports='+counts[1]+'/8\n');
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
}

if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
