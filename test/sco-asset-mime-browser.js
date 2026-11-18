'use strict';

const assert=require('node:assert/strict');
const {createServer}=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {createScoHandler}=require('../src');

/** @type {import('../src/core').SourceFile[]} */
const files=[
  {path:'index.html',sourceType:'asset',code:[
    '<!doctype html><html><head>',
    '<link rel="stylesheet" href="./site.css">',
    '</head><body>',
    '<div id="marker">styled</div>',
    '<img id="icon" src="./vector.svg">',
    '<pre id="out">pending</pre>',
    '<script type="module" src="./boot.mjs"></script>',
    '</body></html>'
  ].join('')},
  {path:'site.css',sourceType:'asset',code:'#marker{color:rgb(0,128,0)}'},
  {path:'vector.svg',sourceType:'asset',code:[
    '<svg xmlns="http://www.w3.org/2000/svg" width="9" height="7">',
    '<rect width="9" height="7" fill="green"/></svg>'
  ].join('')},
  {path:'boot.mjs',sourceType:'module',code:[
    'const icon=document.getElementById("icon");',
    'if(!icon.complete)await new Promise(resolve=>{icon.onload=resolve;icon.onerror=resolve});',
    'const color=getComputedStyle(document.getElementById("marker")).color;',
    'document.getElementById("out").textContent=color+"|"+icon.naturalWidth+"|"+icon.naturalHeight;'
  ].join('\n')}
];

/**
 * A real browser must apply a served stylesheet, render a served SVG and run
 * the generated ESM. Fetch-only header checks cannot prove these operations.
 * @returns {Promise<void>}
 */
async function main(){
  const server=createServer(createScoHandler(files,{publicPaths:files.map(file=>file.path)}));
  /** @type {Promise<void>} */
  const listening=new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  await listening;
  try{
    const address=server.address();
    assert.ok(address && typeof address==='object');
    const url='http://127.0.0.1:'+address.port+'/obfs/index.html';
    const browser=process.env.CHROMIUM_BIN??'chromium';
    const {stdout}=await promisify(execFile)(browser,[
      '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
      '--no-first-run','--virtual-time-budget=7000','--dump-dom',url
    ],{timeout:45000,maxBuffer:4*1024*1024,encoding:'utf8'});
    const observed=stdout.match(/<pre id="out">([^<]+)<\/pre>/u)?.[1];
    assert.equal(observed,'rgb(0, 128, 0)|9|7',
      'Chromium SCO CSS/SVG/ESM parity: '+stdout.slice(0,1200));
    process.stdout.write('Chromium SCO validated CSS, SVG and generated ESM rendering: '+observed+'\n');
  }finally{
    /** @type {Promise<void>} */
    const closed=new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve()));
    await closed;
  }
}

if(require.main===module){
  main().catch(error=>{console.error(error);process.exitCode=1;});
}

module.exports={main};
