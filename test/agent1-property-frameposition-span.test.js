'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src/core');

const exec=promisify(execFile);
const source="const owner={longPrivatePropertyName:21,'longPrivateStringProperty':22,'longPrivateUnicodeProperty😀':23};const value=owner.longPrivatePropertyName+owner['longPrivateStringProperty']+owner['longPrivateUnicodeProperty😀'];captureHostStack();export {value};";

/**
 * @param {string} url
 * @returns {Promise<string>}
 */
async function dumpDom(url) {
  const {stdout}=await exec(process.env.CHROMIUM_BIN??'google-chrome',[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=8000','--dump-dom',url
  ],{timeout:45000,maxBuffer:4*1024*1024,encoding:'utf8'});
  const encoded=stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
  assert.ok(encoded,'Chromium failed to expose the observation payload: '+stdout.slice(0,1200));
  return Buffer.from(encoded,'base64').toString('utf8');
}

/**
 * @param {string} stack
 * @param {string} pathname
 * @returns {{line:number,column:number,frame:string}}
 */
function parseFrame(stack,pathname) {
  const frame=stack.split('\n').find(line=>line.includes(pathname))??'';
  assert.ok(frame,'Missing module frame for '+pathname+': '+stack);
  const match=frame.match(/:(\d+):(\d+)\)?$/u);
  assert.ok(match,'Missing source coordinates in '+frame);
  return {line:Number(match[1]),column:Number(match[2]),frame};
}

test('real Chromium strict ESM private-object rewrites preserve later FramePosition',{
  skip:process.platform!=='linux'?'real Chromium fixture currently targets the Linux runner':false
},async()=>{
  const output=obfuscateFiles([{
    path:'generated.mjs',sourceType:'module',code:source
  }],{
    mode:'coo',closedWorld:true,seed:'agent1-property-frameposition-span',
    identifiers:false,strings:false,properties:true
  }).files[0];
  const generatedCode=String(output.code);
  assert.equal(generatedCode.length,source.length,
    'span-preserving property edits must keep the whole source length unchanged');
  assert.equal(output.metrics.properties,3,
    'the fixture must exercise all three private-property rewrites');
  const html=[
    '<!doctype html><html><body><pre id="result"></pre><script>',
    'window.__stacks=[];',
    'window.captureHostStack=function captureHostStack(){window.__stacks.push(new Error("frame probe").stack||"");};',
    '(async()=>{try{const native=await import("/native.mjs");const generated=await import("/generated.mjs");',
    'const result={values:[native.value,generated.value],stacks:window.__stacks};',
    'document.getElementById("result").textContent=btoa(JSON.stringify(result));',
    '}catch(error){document.getElementById("result").textContent=btoa(JSON.stringify({error:String(error),stack:error&&error.stack}));}})();',
    '</script></body></html>'
  ].join('\n');
  const pages=new Map([
    ['/',{type:'text/html; charset=utf-8',body:html}],
    ['/native.mjs',{type:'text/javascript; charset=utf-8',body:source}],
    ['/generated.mjs',{type:'text/javascript; charset=utf-8',body:generatedCode}]
  ]);
  const server=http.createServer((request,response)=>{
    const entry=pages.get((request.url??'/').split('?')[0])??pages.get('/');
    if(!entry){response.writeHead(404);response.end();return;}
    response.writeHead(200,{'content-type':entry.type});
    response.end(entry.body);
  });
  try {
    /** @type {Promise<void>} */
    const listening=new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',()=>resolve());
    });
    await listening;
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('Missing Chromium fixture port');
    const payload=JSON.parse(await dumpDom('http://127.0.0.1:'+address.port+'/'));
    assert.deepEqual(payload.values,[66,66]);
    assert.equal(payload.stacks.length,2);
    const native=parseFrame(payload.stacks[0],'/native.mjs');
    const generated=parseFrame(payload.stacks[1],'/generated.mjs');
    process.stdout.write('AGENT1_PROPERTY_FRAMEPOSITION '+JSON.stringify({
      runtime:'Chromium',
      propertyRewrites:output.metrics.properties,
      native,generated,values:payload.values,
      generatedCode
    })+'\n');
    assert.equal(generated.line,native.line);
    assert.equal(generated.column,native.column,
      'Property-only edits must not move a later strict-ESM module frame; '+
      'property rewrites='+output.metrics.properties+
      ', native='+native.frame+', generated='+generated.frame);
  } finally {
    /** @type {Promise<void>} */
    const closed=new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
    await closed;
  }
});

test('span-preserving property mode refuses short keys and unsupported edit forms',()=>{
  const fixtures=[
    {name:'short-key',code:'const owner={x:21};const value=owner.x;export {value};'},
    {name:'shorthand',code:'const longPrivatePropertyName=21;const owner={longPrivatePropertyName};const value=owner.longPrivatePropertyName;export {value};'},
    {name:'destructuring',code:'const owner={longPrivatePropertyName:21};const {longPrivatePropertyName}=owner;export {longPrivatePropertyName as value};'},
    {name:'in-check',code:"const owner={longPrivatePropertyName:21};const value='longPrivatePropertyName' in owner;export {value};"}
  ];
  for(const fixture of fixtures) {
    const output=obfuscateFiles([{
      path:fixture.name+'.mjs',sourceType:'module',code:fixture.code
    }],{
      mode:'coo',closedWorld:true,seed:'agent1-property-frameposition-refusal',
      identifiers:false,strings:false,properties:true
    }).files[0];
    assert.equal(output.metrics.properties,0,fixture.name+' must not perform a width-unsafe or unsupported rewrite');
  }
});
