'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src/core');

const exec=promisify(execFile);
const source='const owner={longPrivatePropertyName:21};class Reader{read(){return owner.longPrivatePropertyName;}}const reader=new Reader();const value=reader.read();captureHostStack();export {value};';

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

test('real Chromium strict ESM private-class rewrite preserves later FramePosition',{
  skip:process.platform!=='linux'?'real Chromium fixture currently targets the Linux runner':false
},async()=>{
  const output=obfuscateFiles([{
    path:'generated.mjs',sourceType:'module',code:source
  }],{
    mode:'coo',closedWorld:true,seed:'agent9-private-class-frameposition-browser',
    identifiers:false,strings:false,properties:true
  }).files[0];
  const generatedCode=String(output.code);
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
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',resolve);
    });
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('Missing Chromium fixture port');
    const payload=JSON.parse(await dumpDom('http://127.0.0.1:'+address.port+'/'));
    assert.deepEqual(payload.values,[21,21]);
    assert.equal(payload.stacks.length,2);
    const native=parseFrame(payload.stacks[0],'/native.mjs');
    const generated=parseFrame(payload.stacks[1],'/generated.mjs');
    process.stdout.write('AGENT9_PRIVATE_CLASS_FRAMEPOSITION '+JSON.stringify({
      runtime:'Chromium',
      privateProperty:'longPrivatePropertyName',
      propertyRewrites:output.metrics.properties,
      emittedPrivateName:generatedCode.match(/owner\.([A-Za-z_$][\w$]*)/)?.[1]??null,
      native,generated,
      values:payload.values
    })+'\n');
    assert.equal(generated.line,native.line);
    assert.equal(generated.column,native.column,
      'A private class owner-key rewrite must not move a later strict-ESM module frame; '+
      'property rewrites='+output.metrics.properties+
      ', native='+native.frame+', generated='+generated.frame);
  } finally {
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
});


test('real Chromium strict ESM combined property, identifier, and string transforms preserve later FramePosition',{
  skip:process.platform!=='linux'?'real Chromium fixture currently targets the Linux runner':false
},async()=>{
  const combinedSource='const marker="xy";const owner={longPrivatePropertyName:21};class Reader{read(){return owner.longPrivatePropertyName;}}const reader=new Reader();const value=reader.read()+marker.length;captureHostStack();export {value};';
  const output=obfuscateFiles([{
    path:'generated-combined.mjs',sourceType:'module',code:combinedSource
  }],{
    mode:'coo',closedWorld:true,seed:'agent9-private-class-frameposition-combined',
    identifiers:true,strings:true,properties:true
  }).files[0];
  const generatedCode=String(output.code);
  const html=[
    '<!doctype html><html><body><pre id="result"></pre><script>',
    'window.__stacks=[];',
    'window.captureHostStack=function captureHostStack(){window.__stacks.push(new Error("frame probe").stack||"");};',
    '(async()=>{try{const native=await import("/native-combined.mjs");const generated=await import("/generated-combined.mjs");',
    'const result={values:[native.value,generated.value],stacks:window.__stacks};',
    'document.getElementById("result").textContent=btoa(JSON.stringify(result));',
    '}catch(error){document.getElementById("result").textContent=btoa(JSON.stringify({error:String(error),stack:error&&error.stack}));}})();',
    '</script></body></html>'
  ].join('\n');
  const pages=new Map([
    ['/',{type:'text/html; charset=utf-8',body:html}],
    ['/native-combined.mjs',{type:'text/javascript; charset=utf-8',body:combinedSource}],
    ['/generated-combined.mjs',{type:'text/javascript; charset=utf-8',body:generatedCode}]
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
    assert.deepEqual(payload.values,[23,23]);
    assert.equal(payload.stacks.length,2);
    const native=parseFrame(payload.stacks[0],'/native-combined.mjs');
    const generated=parseFrame(payload.stacks[1],'/generated-combined.mjs');
    process.stdout.write('AGENT9_PRIVATE_CLASS_FRAMEPOSITION_COMBINED '+JSON.stringify({
      runtime:'Chromium',
      metrics:{properties:output.metrics.properties,bindings:output.metrics.bindings,literals:output.metrics.literals},
      native,generated,values:payload.values
    })+'\n');
    assert.equal(output.metrics.properties,1,'the private owner-key rewrite must remain active');
    assert.equal(generated.line,native.line);
    assert.equal(generated.column,native.column,
      'the full combined transform pipeline must preserve the later strict-ESM module frame; '+
      'metrics='+JSON.stringify(output.metrics)+
      ', native='+native.frame+', generated='+generated.frame);
  } finally {
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
});


test('real Chromium strict ESM computed-property rewrite preserves later FramePosition',{
  skip:process.platform!=='linux'?'real Chromium fixture currently targets the Linux runner':false
},async()=>{
  const computedSource="const owner={longPrivatePropertyName:21};class Reader{read(){return owner['longPrivatePropertyName'];}}const reader=new Reader();const value=reader.read();captureHostStack();export {value};";
  const output=obfuscateFiles([{
    path:'generated-computed.mjs',sourceType:'module',code:computedSource
  }],{
    mode:'coo',closedWorld:true,seed:'agent9-private-class-frameposition-computed',
    identifiers:false,strings:false,properties:true
  }).files[0];
  const generatedCode=String(output.code);
  const html=[
    '<!doctype html><html><body><pre id="result"></pre><script>',
    'window.__stacks=[];',
    'window.captureHostStack=function captureHostStack(){window.__stacks.push(new Error("frame probe").stack||"");};',
    '(async()=>{try{const native=await import("/native-computed.mjs");const generated=await import("/generated-computed.mjs");',
    'const result={values:[native.value,generated.value],stacks:window.__stacks};',
    'document.getElementById("result").textContent=btoa(JSON.stringify(result));',
    '}catch(error){document.getElementById("result").textContent=btoa(JSON.stringify({error:String(error),stack:error&&error.stack}));}})();',
    '</script></body></html>'
  ].join('\n');
  const pages=new Map([
    ['/',{type:'text/html; charset=utf-8',body:html}],
    ['/native-computed.mjs',{type:'text/javascript; charset=utf-8',body:computedSource}],
    ['/generated-computed.mjs',{type:'text/javascript; charset=utf-8',body:generatedCode}]
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
    assert.deepEqual(payload.values,[21,21]);
    assert.equal(payload.stacks.length,2);
    const native=parseFrame(payload.stacks[0],'/native-computed.mjs');
    const generated=parseFrame(payload.stacks[1],'/generated-computed.mjs');
    process.stdout.write('AGENT9_PRIVATE_CLASS_FRAMEPOSITION_COMPUTED '+JSON.stringify({
      runtime:'Chromium',
      propertyRewrites:output.metrics.properties,
      generatedName:generatedCode.match(/owner\["([A-Za-z_$][\w$]*)"\]/u)?.[1]??null,
      native,generated,values:payload.values
    })+'\n');
    assert.equal(output.metrics.properties,1,'the computed private owner-key rewrite must remain active');
    assert.equal(generated.line,native.line);
    assert.equal(generated.column,native.column,
      'a computed owner-key rewrite must preserve the later strict-ESM module frame; '+
      'native='+native.frame+', generated='+generated.frame);
  } finally {
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
});
