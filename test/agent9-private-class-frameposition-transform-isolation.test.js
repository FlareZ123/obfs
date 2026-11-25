'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src/core');

const exec=promisify(execFile);

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

/**
 * @param {string} source
 * @param {{identifiers:boolean,strings:boolean,properties:boolean}} transforms
 * @param {string} slug
 * @returns {Promise<{metrics:{properties:number,bindings:number,literals:number},values:number[],native:{line:number,column:number,frame:string},generated:{line:number,column:number,frame:string}}>}
 */
async function runProbe(source,transforms,slug) {
  const output=obfuscateFiles([{
    path:'generated-'+slug+'.mjs',sourceType:'module',code:source
  }],{
    mode:'coo',closedWorld:true,seed:'agent9-frameposition-isolation/'+slug,
    ...transforms
  }).files[0];
  const generatedCode=String(output.code);
  const nativePath='/native-'+slug+'.mjs';
  const generatedPath='/generated-'+slug+'.mjs';
  const html=[
    '<!doctype html><html><body><pre id="result"></pre><script>',
    'window.__stacks=[];',
    'window.captureHostStack=function captureHostStack(){window.__stacks.push(new Error("frame probe").stack||"");};',
    '(async()=>{try{const native=await import("'+nativePath+'");const generated=await import("'+generatedPath+'");',
    'const result={values:[native.value,generated.value],stacks:window.__stacks};',
    'document.getElementById("result").textContent=btoa(JSON.stringify(result));',
    '}catch(error){document.getElementById("result").textContent=btoa(JSON.stringify({error:String(error),stack:error&&error.stack}));}})();',
    '</script></body></html>'
  ].join('\n');
  const pages=new Map([
    ['/',{type:'text/html; charset=utf-8',body:html}],
    [nativePath,{type:'text/javascript; charset=utf-8',body:source}],
    [generatedPath,{type:'text/javascript; charset=utf-8',body:generatedCode}]
  ]);
  const server=http.createServer((request,response)=>{
    const entry=pages.get((request.url??'/').split('?')[0])??pages.get('/');
    if(!entry){response.writeHead(404);response.end();return;}
    response.writeHead(200,{'content-type':entry.type});
    response.end(entry.body);
  });
  try {
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',resolve);
    });
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('Missing Chromium fixture port');
    const payload=JSON.parse(await dumpDom('http://127.0.0.1:'+address.port+'/'));
    assert.equal(payload.stacks.length,2);
    return {
      metrics:output.metrics,
      values:payload.values,
      native:parseFrame(payload.stacks[0],nativePath),
      generated:parseFrame(payload.stacks[1],generatedPath)
    };
  } finally {
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
}

const marker='source-observer-marker';
const stringSource='const marker="source-observer-marker";const owner={longPrivatePropertyName:21};class Reader{read(){return owner.longPrivatePropertyName;}}const reader=new Reader();const value=reader.read()+marker.length;captureHostStack();export {value};';
const identifierSource='const owner={longPrivatePropertyName:21};class Reader{read(){return owner.longPrivatePropertyName;}}const reader=new Reader();const value=reader.read()+2;captureHostStack();export {value};';

for(const [name,source,transforms,expected,requiredMetric] of [
  ['identifier-only',identifierSource,{properties:true,identifiers:true,strings:false,experimentalPreserveFramePositions:true},23,'bindings'],
  ['string-only',stringSource,{properties:true,identifiers:false,strings:true,experimentalPreserveFramePositions:true},21+marker.length,'literals'],
  ['combined',stringSource,{properties:true,identifiers:true,strings:true,experimentalPreserveFramePositions:true},21+marker.length,'bindings']
]){
  test('real Chromium strict ESM '+name+' transform preserves FramePosition',{
    skip:process.platform!=='linux'?'real Chromium fixture currently targets the Linux runner':false
  },async()=>{
    const result=await runProbe(source,transforms,name);
    assert.deepEqual(result.values,[expected,expected]);
    assert.equal(result.metrics.properties,1,'the private owner-key rewrite must remain active');
    assert.ok(result.metrics[requiredMetric]>0,name+' transform must be exercised');
    process.stdout.write('AGENT9_PRIVATE_CLASS_FRAMEPOSITION_'+name.toUpperCase()+' '+JSON.stringify({
      metrics:{properties:result.metrics.properties,bindings:result.metrics.bindings,literals:result.metrics.literals},
      native:result.native,generated:result.generated,values:result.values
    })+'\n');
    assert.equal(result.generated.line,result.native.line);
    assert.equal(result.generated.column,result.native.column,
      name+' transformation changed the later strict-ESM module frame; metrics='+
      JSON.stringify(result.metrics)+', native='+result.native.frame+', generated='+result.generated.frame);
  });
}
