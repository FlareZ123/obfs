'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {createHash}=require('node:crypto');
const {transformSync}=require('esbuild');
const {obfuscateFiles}=require('../src');

const runBrowser=promisify(execFile);
const original="'use strict';" +
  'const owner={acc:5,step:3};' +
  'function hidden(x){owner.acc+=((x&7)+owner.step);return owner.acc|0;}' +
  'export function compute(x){return hidden(x);}';
const handwrittenSymbol="'use strict';" +
  'const ka=Symbol(),ks=Symbol();' +
  'const owner={[ka]:5,[ks]:3};' +
  'function hidden(x){owner[ka]+=((x&7)+owner[ks]);return owner[ka]|0;}' +
  'export function compute(x){return hidden(x);}';
const computedString="'use strict';" +
  'const ka="_acc",ks="_step";' +
  'const owner={[ka]:5,[ks]:3};' +
  'function hidden(x){owner[ka]+=((x&7)+owner[ks]);return owner[ka]|0;}' +
  'export function compute(x){return hidden(x);}';

/**
 * @param {string} source
 * @returns {{sha256:string,bytes:number}}
 */
function sourceIdentity(source) {
  return {sha256:createHash('sha256').update(source).digest('hex'),
    bytes:Buffer.byteLength(source)};
}

/**
 * A separate real Chromium ESM instance is imported for every paired hot-work
 * sample, outside the measured hot interval. Browser CSP prevents eval.
 * @returns {string}
 */
function browserRunner() {
  return [
    "'use strict';",
    'const warm=1000000,hot=15000000,pairs=7;',
    "const variants=['hashed-string','unregistered-symbol',",
    "  'handwritten-symbol','handwritten-computed-string',",
    "  'ordinary-esbuild-minified','same-code-control'];",
    'let nonce=0;',
    'async function fresh(name){',
    '  const mod=await import("/"+name+".mjs?pair="+(nonce++));',
    '  if(typeof mod.compute!=="function")throw Error("Missing compute: "+name);',
    '  return mod.compute;',
    '}',
    'function work(fn,n){let checksum=0;',
    '  for(let i=0;i<n;i++)checksum^=fn(((i*13)^(i>>>5))|0);',
    '  return checksum|0;',
    '}',
    'function timed(fn){work(fn,warm);const start=performance.now();',
    '  const checksum=work(fn,hot);',
    '  return {checksum,wallMs:performance.now()-start};',
    '}',
    'async function measurePair(variant,i){',
    '  const n=await fresh("native");',
    '  const e=await fresh(variant);',
    '  const a=(i%2===0)?timed(n):timed(e);',
    '  const b=(i%2===0)?timed(e):timed(n);',
    '  const native=(i%2===0)?a:b;',
    '  const emitted=(i%2===0)?b:a;',
    '  if(native.checksum!==emitted.checksum)throw Error("Checksum mismatch: "+variant);',
    '  return {native,emitted,wallRatio:emitted.wallMs/native.wallMs};',
    '}',
    'function median(values){const s=[...values].sort((a,b)=>a-b);',
    '  return s[Math.floor(s.length/2)];}',
    'async function main(){const results=[];',
    '  for(const variant of variants){const measurements=[];',
    '    for(let i=0;i<pairs;i++)measurements.push(await measurePair(variant,i));',
    '    const ratios=measurements.map(p=>p.wallRatio);',
    '    results.push({variant,pairs:measurements,medianWallRatio:median(ratios),',
    '      strictWallBreaches:ratios.filter(x=>x>2.5).length});',
    '  }',
    '  const answer={browser:"Chromium",warm,hot,pairs,results};',
    '  const pre=document.createElement("pre");pre.id="result";',
    '  pre.textContent=btoa(JSON.stringify(answer));document.body.appendChild(pre);',
    '}',
    'main().catch(error=>{const pre=document.createElement("pre");',
    '  pre.id="failure";pre.textContent=String(error.stack||error);',
    '  document.body.appendChild(pre);});'
  ].join('\n');
}

/**
 * Verify ordinary generated and equal-trust ESM variants in a genuine
 * network-served browser with independent private state per timed pair.
 * @returns {Promise<void>}
 */
async function main() {
  const input=[{path:'leaf.mjs',sourceType:/** @type {const} */ ('module'),code:original}];
  const base={mode:/** @type {const} */ ('coo'),seed:'symbol-browser-hot-work-20261122',
    closedWorld:false,identifiers:false,strings:false,properties:true};
  const hashed=obfuscateFiles(input,base).files[0];
  const symbols=obfuscateFiles(input,{...base,experimentalSymbolKeys:true}).files[0];
  assert.equal(typeof hashed.code,'string');
  assert.equal(typeof symbols.code,'string');
  assert.equal(hashed.metrics.properties,2,'Required two genuine hash-key field rewrites');
  assert.equal(symbols.metrics.symbolKeys,2,'Required two genuine Symbol-key field rewrites');
  const minified=transformSync(original,{
    minify:true,loader:'js',platform:'browser',target:'chrome125',format:'esm'
  }).code;
  /** @type {Map<string,string>} */
  const resources=new Map([
    ['/native.mjs',original],
    ['/hashed-string.mjs',/** @type {string} */ (hashed.code)],
    ['/unregistered-symbol.mjs',/** @type {string} */ (symbols.code)],
    ['/handwritten-symbol.mjs',handwrittenSymbol],
    ['/handwritten-computed-string.mjs',computedString],
    ['/ordinary-esbuild-minified.mjs',minified],
    ['/same-code-control.mjs',original],
    ['/runner.mjs',browserRunner()],
    ['/index.html','<!doctype html><html><head><meta charset="utf-8"></head><body>'+
      '<script type="module" src="/runner.mjs"></script></body></html>']
  ]);
  const server=http.createServer((request,response)=>{
    const pathname=new URL(request.url??'/','http://127.0.0.1').pathname;
    const value=resources.get(pathname);
    if(value===undefined){response.writeHead(404).end();return;}
    response.writeHead(200,{
      'content-type':pathname.endsWith('.html')?
        'text/html; charset=utf-8':'text/javascript; charset=utf-8',
      'cache-control':'no-store',
      'content-security-policy':"default-src 'none'; script-src 'self'; connect-src 'self'"
    });
    response.end(value);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  try {
    const address=server.address();
    assert.ok(address && typeof address!=='string');
    const binary=process.env.CHROMIUM_BIN??'google-chrome';
    const {stdout:version}=await runBrowser(binary,['--version'],{timeout:10000});
    const origin='http://127.0.0.1:'+address.port;
    const {stdout}=await runBrowser(binary,[
      '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
      '--no-first-run','--virtual-time-budget=180000','--dump-dom',origin+'/index.html'
    ],{timeout:240000,maxBuffer:10*1024*1024,encoding:'utf8'});
    const encoded=stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
    assert.ok(encoded,'Chromium numeric source test failed: '+stdout.slice(-2000));
    const answer=JSON.parse(Buffer.from(encoded,'base64').toString('utf8'));
    assert.equal(answer.browser,'Chromium');
    assert.equal(answer.results.length,6);
    for(const row of answer.results) {
      assert.equal(row.pairs.length,7);
      for(const pair of row.pairs)
        assert.equal(pair.native.checksum,pair.emitted.checksum);
    }
    console.log('BROWSER_PRIVATE_KEY_CPU_PROFILE '+JSON.stringify({
      browserVersion:version.trim(),node:process.version,platform:process.platform,
      compiledSource:sourceIdentity(original),
      hashes:sourceIdentity(/** @type {string} */ (hashed.code)),
      symbols:sourceIdentity(/** @type {string} */ (symbols.code)),
      esbuild:sourceIdentity(minified),
      ...answer
    }));
  } finally {
    await new Promise(resolve=>server.close(resolve));
  }
}

if(require.main===module)main().catch(error=>{
  console.error(error);process.exitCode=1;
});
module.exports={main};
