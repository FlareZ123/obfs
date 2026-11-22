'use strict';

const assert=require('node:assert/strict');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');

/** @typedef {{input:string,base:string|undefined}} UrlCase */
/** @type {UrlCase[]} */
const samples=[];
const hosts=[
  'example.test','EXAMPLE.TEST.','eXample.tesT','K.example','ß.example',
  'ς.example','İ.example','Σ.example','faß.de','straße.example',
  'क.example','中文.example','ｆｏｏ.example','é.example',
  'xn--e28h.example','\u200d.example'
];
const codepoints=[
  0x034f,0x061c,0x08a1,0x0c5c,0x11f00,0x11f04,0x11f12,0x11f3a,
  0x1e4d0,0x1e4d2,0x10d40,0x10d50,0x1e5d0,0x1e5d2,0x1bca0,
  0x31350,0x323af,0x1fae8,0x1faf8,0x16d40,0x16d60,
  0x2e2f,0x2e3a,0x2065,0x200c,0x200d,0x00ad,0x115f,
  0x1d2c0,0x2a6df,0x212a,0x1e9e,0x03c2,0x03a3
];
for(const cp of codepoints)hosts.push(String.fromCodePoint(cp)+'.example');
hosts.push(String.fromCharCode(0xd800)+'.example');
for(const host of hosts)for(const scheme of ['https://','http://','ftp://']){
  samples.push({input:scheme+host+'/path?q=%FF#fragment',base:undefined});
}
const odd=[
  'https://exa%00mple.com/','https://%E2%80%8D.example/a',
  'https://xn--a.example/','https://xn--.example/',
  'https://%FF.example/','https://foo%2Ebar.example/',
  'https://user:pass@example.test:443/a/../b',
  'https://[::ffff:192.0.2.1]/x','https://[fe80::1%25eth0]/',
  'https://127.1/','https://0x7f000001/','https://010.010.010.010/',
  'https://example.test:00080/','https://example.test:999999/',
  'file:///C:/Users/Alice/a','file://server/share/a',
  'https://example.test\\a\\b','https://example.test/a/%2E%2e/b',
  'https://example.test/a%2fb','https://example.test/%00',
  'https://example.test/?q=é'
];
for(const value of odd)samples.push({input:value,base:undefined});
for(const path of ['./a','../b','/%2e%2e/a','?q=%00','#fragment',
  'C:\\foo\\bar','\\example.test\\path','//K.example/a']){
  samples.push({input:path,base:'https://example.test/dir/page'});
}

/**
 * @param {UrlCase} source
 * @returns {{ok:boolean,href?:string,hostname?:string,origin?:string,pathname?:string,error?:string}}
 */
function inspect(source){
  try{
    const parsed=new URL(source.input,source.base);
    return {ok:true,href:parsed.href,hostname:parsed.hostname,
      origin:parsed.origin,pathname:parsed.pathname};
  }catch(error){
    return {ok:false,error:error instanceof Error?error.name:String(error)};
  }
}

async function main(){
  const native=samples.map(inspect);
  const script='const samples='+JSON.stringify(samples)+';'+
    'const out=samples.map(source=>{try{'+
    'const u=new URL(source.input,source.base);'+
    'return {ok:true,href:u.href,hostname:u.hostname,origin:u.origin,pathname:u.pathname};'+
    '}catch(e){return {ok:false,error:e.name};}});'+
    'document.getElementById("answer").textContent=encodeURIComponent(JSON.stringify(out));';
  const html='<!doctype html><html><body><pre id="answer">loading</pre>'+
    '<script>'+script+'</script></body></html>';
  const binary=process.env.CHROMIUM_BIN??'google-chrome';
  const url='data:text/html;charset=utf-8,'+encodeURIComponent(html);
  const {stdout}=await promisify(execFile)(binary,[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=3000','--dump-dom',url
  ],{timeout:45000,maxBuffer:8*1024*1024,encoding:'utf8'});
  const match=stdout.match(/<pre id="answer">([^<]+)<\/pre>/u);
  assert.ok(match,'Browser URL results missing from DOM');
  /** @type {ReturnType<typeof inspect>[]} */
  const browser=JSON.parse(decodeURIComponent(match[1]));
  assert.equal(browser.length,native.length);
  const differences=[];
  for(let index=0;index<samples.length;index++){
    if(JSON.stringify(native[index])!==JSON.stringify(browser[index])){
      differences.push({input:samples[index].input,base:samples[index].base,
        node:native[index],browser:browser[index]});
    }
  }
  console.log('Native Node/Chrome WHATWG URL differential: '+JSON.stringify({
    node:process.version,browser:binary,caseCount:samples.length,
    mismatchCount:differences.length,differences
  }));
  assert.deepEqual(native[0],browser[0],
    'Plain reference HTTP/HTTPS URL parsing must agree');
}

main().catch(error=>{console.error(error);process.exitCode=1;});
