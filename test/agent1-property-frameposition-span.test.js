'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const Module=require('node:module');
const path=require('node:path');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src/core');

const exec=promisify(execFile);
const source="const owner={longPrivatePropertyName:21,'longPrivateStringProperty':22,'longPrivateUnicodeProperty😀':23};const value=owner.longPrivatePropertyName+owner['longPrivateStringProperty']+owner['longPrivateUnicodeProperty😀'];captureHostStack();export {value};";
const identifierSource="'use strict';const extraordinarilyLongPrivateBindingName=21;const value=extraordinarilyLongPrivateBindingName;captureHostStack();export {value};";

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
    mode:'coo',closedWorld:false,seed:'agent1-property-frameposition-span',
    experimentalLocalPropertySpanPreservation:true,
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


test('experimental local property-span mode is opt-in and works in all three modes',()=>{
  for(const mode of /** @type {Array<'coo'|'sco'|'sno'>} */(['coo','sco','sno'])) {
    const span=obfuscateFiles([{
      path:'mode-'+mode+'.mjs',sourceType:'module',code:source
    }],{
      mode,closedWorld:false,seed:'agent1-property-frameposition-span/'+mode,
      identifiers:false,strings:false,properties:true,
      experimentalLocalPropertySpanPreservation:true
    }).files[0];
    assert.equal(span.metrics.properties,3,mode+' should retain all three long-key rewrites');
    assert.equal(String(span.code).length,source.length,
      mode+' property-only output must preserve UTF-16 source width');
    const ordinary=obfuscateFiles([{
      path:'ordinary-'+mode+'.mjs',sourceType:'module',code:source
    }],{
      mode,closedWorld:false,seed:'agent1-property-frameposition-default/'+mode,
      identifiers:false,strings:false,properties:true
    }).files[0];
    assert.equal(ordinary.metrics.properties,3,
      mode+' default property rename yield must remain unchanged');
    assert.notEqual(String(ordinary.code).length,source.length,
      mode+' default mode is not required to preserve property source width');
  }
});



test('real Chromium strict ESM identifier-span rewrites preserve later FramePosition',{
  skip:process.platform!=='linux'?'real Chromium fixture currently targets the Linux runner':false
},async()=>{
  const output=obfuscateFiles([{
    path:'generated-identifiers.mjs',sourceType:'module',code:identifierSource
  }],{
    mode:'coo',closedWorld:false,seed:'agent1-identifier-frameposition-span',
    identifiers:true,strings:false,properties:false,
    experimentalLocalIdentifierSpanPreservation:true
  }).files[0];
  const generatedCode=String(output.code);
  assert.ok(output.metrics.bindings>0,'the fixture must exercise an identifier rewrite');
  assert.equal(generatedCode.length,identifierSource.length);
  assert.ok(!generatedCode.includes('extraordinarilyLongPrivateBindingName'));
  const html=[
    '<!doctype html><html><body><pre id="result"></pre><script>',
    'window.__stacks=[];',
    'window.captureHostStack=function captureHostStack(){window.__stacks.push(new Error("frame probe").stack||"");};',
    '(async()=>{try{const native=await import("/native-identifiers.mjs");const generated=await import("/generated-identifiers.mjs");',
    'const result={values:[native.value,generated.value],stacks:window.__stacks};',
    'document.getElementById("result").textContent=btoa(JSON.stringify(result));',
    '}catch(error){document.getElementById("result").textContent=btoa(JSON.stringify({error:String(error),stack:error&&error.stack}));}})();',
    '</script></body></html>'
  ].join('\n');
  const pages=new Map([
    ['/',{type:'text/html; charset=utf-8',body:html}],
    ['/native-identifiers.mjs',{type:'text/javascript; charset=utf-8',body:identifierSource}],
    ['/generated-identifiers.mjs',{type:'text/javascript; charset=utf-8',body:generatedCode}]
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
    assert.deepEqual(payload.values,[21,21]);
    assert.equal(payload.stacks.length,2);
    const native=parseFrame(payload.stacks[0],'/native-identifiers.mjs');
    const generated=parseFrame(payload.stacks[1],'/generated-identifiers.mjs');
    process.stdout.write('AGENT1_IDENTIFIER_FRAMEPOSITION '+JSON.stringify({
      bindings:output.metrics.bindings,native,generated,values:payload.values,generatedCode
    })+'\\n');
    assert.equal(generated.line,native.line);
    assert.equal(generated.column,native.column,
      'identifier-only edits must not move a later strict-ESM module frame');
  } finally {
    /** @type {Promise<void>} */
    const closed=new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
    await closed;
  }
});

test('experimental identifier-span mode is opt-in, width-bounded, and mode-independent',()=>{
  for(const mode of /** @type {Array<'coo'|'sco'|'sno'>} */(['coo','sco','sno'])) {
    const span=obfuscateFiles([{
      path:'identifier-'+mode+'.mjs',sourceType:'module',code:identifierSource
    }],{
      mode,closedWorld:false,seed:'agent1-identifier-span/'+mode,
      identifiers:true,strings:false,properties:false,
      experimentalLocalIdentifierSpanPreservation:true
    }).files[0];
    assert.ok(span.metrics.bindings>0,mode+' should rename the long binding');
    assert.equal(String(span.code).length,identifierSource.length,
      mode+' identifier-only output must preserve UTF-16 source width');
    const ordinary=obfuscateFiles([{
      path:'identifier-default-'+mode+'.mjs',sourceType:'module',code:identifierSource
    }],{
      mode,closedWorld:false,seed:'agent1-identifier-default/'+mode,
      identifiers:true,strings:false,properties:false
    }).files[0];
    assert.ok(ordinary.metrics.bindings>0,mode+' default identifier rename yield must remain unchanged');
    assert.notEqual(String(ordinary.code).length,identifierSource.length,
      mode+' default mode is not required to preserve identifier source width');
  }
  const shortSource='const x=21;const value=x;export {value};';
  const span=obfuscateFiles([{
    path:'short-identifier.mjs',sourceType:'module',code:shortSource
  }],{
    mode:'coo',closedWorld:false,seed:'agent1-short-identifier-span',
    identifiers:true,strings:false,properties:false,
    experimentalLocalIdentifierSpanPreservation:true
  }).files[0];
  assert.equal(span.metrics.bindings,0,'short identifiers must remain unchanged when the replacement cannot fit');
  assert.equal(String(span.code),shortSource);
  const ordinary=obfuscateFiles([{
    path:'short-identifier-default.mjs',sourceType:'module',code:shortSource
  }],{
    mode:'coo',closedWorld:false,seed:'agent1-short-identifier-default',
    identifiers:true,strings:false,properties:false
  }).files[0];
  assert.equal(ordinary.metrics.bindings,1,'default identifier mangling remains available');
});


test('combined local identifier and property span rewrites preserve strict ESM FramePosition',{
  skip:process.platform!=='linux'?'real Chromium fixture currently targets the Linux runner':false
},async()=>{
  const combinedSource="'use strict';const extraordinarilyLongPrivateBindingName=21;const owner={longPrivatePropertyName:21,'longPrivateStringProperty':22,'longPrivateUnicodeProperty😀':23};const value=extraordinarilyLongPrivateBindingName+owner.longPrivatePropertyName+owner['longPrivateStringProperty']+owner['longPrivateUnicodeProperty😀'];captureHostStack();export {value};";
  const output=obfuscateFiles([{
    path:'generated-combined.mjs',sourceType:'module',code:combinedSource
  }],{
    mode:'coo',closedWorld:false,seed:'agent1-combined-frameposition-span',
    identifiers:true,strings:false,properties:true,
    experimentalLocalIdentifierSpanPreservation:true,
    experimentalLocalPropertySpanPreservation:true
  }).files[0];
  const generatedCode=String(output.code);
  assert.ok(output.metrics.bindings>0);
  assert.equal(output.metrics.properties,3);
  assert.equal(generatedCode.length,combinedSource.length);
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
    /** @type {Promise<void>} */
    const listening=new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',()=>resolve());
    });
    await listening;
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('Missing Chromium fixture port');
    const payload=JSON.parse(await dumpDom('http://127.0.0.1:'+address.port+'/'));
    assert.deepEqual(payload.values,[87,87]);
    assert.equal(payload.stacks.length,2);
    const native=parseFrame(payload.stacks[0],'/native-combined.mjs');
    const generated=parseFrame(payload.stacks[1],'/generated-combined.mjs');
    process.stdout.write('AGENT1_COMBINED_FRAMEPOSITION '+JSON.stringify({
      bindings:output.metrics.bindings,properties:output.metrics.properties,
      native,generated,values:payload.values,generatedCode
    })+'\\n');
    assert.equal(generated.line,native.line);
    assert.equal(generated.column,native.column,
      'combined local identifier and property edits must preserve later ESM frame coordinates');
  } finally {
    /** @type {Promise<void>} */
    const closed=new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
    await closed;
  }
});


test('real Chromium strict ESM lazy string-span decoding preserves later FramePosition',{
  skip:process.platform!=='linux'?'real Chromium fixture currently targets the Linux runner':false
},async()=>{
  const stringSource="'use strict';const a=1;function read(){return 'Span preserving string with emoji 😀';}const value=read()+read();captureHostStack();export {value};";
  const output=obfuscateFiles([{
    path:'generated-strings.mjs',sourceType:'module',code:stringSource
  }],{
    mode:'coo',closedWorld:false,seed:'agent1-string-frameposition-span',
    identifiers:false,strings:true,properties:false,
    experimentalLocalStringSpanPreservation:true
  }).files[0];
  const generatedCode=String(output.code);
  assert.ok(output.metrics.literals>0,'the fixture must exercise string rewriting');
  assert.ok(generatedCode.length>stringSource.length,
    'the lazy decoder is appended after the original source');
  assert.equal(generatedCode.indexOf('captureHostStack()'),stringSource.indexOf('captureHostStack()'),
    'the callsite token must retain its original source offset');
  const html=[
    '<!doctype html><html><body><pre id="result"></pre><script>',
    'window.__stacks=[];',
    'window.captureHostStack=function captureHostStack(){window.__stacks.push(new Error("frame probe").stack||"");};',
    '(async()=>{try{const native=await import("/native-strings.mjs");const generated=await import("/generated-strings.mjs");',
    'const result={values:[native.value,generated.value],stacks:window.__stacks};',
    'document.getElementById("result").textContent=btoa(JSON.stringify(result));',
    '}catch(error){document.getElementById("result").textContent=btoa(JSON.stringify({error:String(error),stack:error&&error.stack}));}})();',
    '</script></body></html>'
  ].join('\n');
  const pages=new Map([
    ['/',{type:'text/html; charset=utf-8',body:html}],
    ['/native-strings.mjs',{type:'text/javascript; charset=utf-8',body:stringSource}],
    ['/generated-strings.mjs',{type:'text/javascript; charset=utf-8',body:generatedCode}]
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
    assert.deepEqual(payload.values,['Span preserving string with emoji 😀Span preserving string with emoji 😀','Span preserving string with emoji 😀Span preserving string with emoji 😀']);
    assert.equal(payload.stacks.length,2);
    const native=parseFrame(payload.stacks[0],'/native-strings.mjs');
    const generated=parseFrame(payload.stacks[1],'/generated-strings.mjs');
    process.stdout.write('AGENT1_STRING_FRAMEPOSITION '+JSON.stringify({
      strings:output.metrics.strings,native,generated,values:payload.values,generatedCode
    })+'\\n');
    assert.equal(generated.line,native.line);
    assert.equal(generated.column,native.column,
      'lazy string decoding must not move a later strict-ESM module frame');
  } finally {
    /** @type {Promise<void>} */
    const closed=new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
    await closed;
  }
});

test('experimental lazy string-span mode preserves source prefix in all three modes',()=>{
  const stringSource="'use strict';const value='This string is long enough to fit the generated decoder call';captureHostStack();export {value};";
  for(const mode of /** @type {Array<'coo'|'sco'|'sno'>} */(['coo','sco','sno'])) {
    const span=obfuscateFiles([{
      path:'string-'+mode+'.mjs',sourceType:'module',code:stringSource
    }],{
      mode,closedWorld:false,seed:'agent1-string-span/'+mode,
      identifiers:false,strings:true,properties:false,
      experimentalLocalStringSpanPreservation:true
    }).files[0];
    assert.ok(span.metrics.literals>0,mode+' should rewrite the fitting string literal');
    assert.equal(String(span.code).indexOf('captureHostStack()'),stringSource.indexOf('captureHostStack()'),
      mode+' must preserve the original callsite offset');
    const ordinary=obfuscateFiles([{
      path:'string-default-'+mode+'.mjs',sourceType:'module',code:stringSource
    }],{
      mode,closedWorld:false,seed:'agent1-string-default/'+mode,
      identifiers:false,strings:true,properties:false
    }).files[0];
    assert.ok(ordinary.metrics.literals>0,mode+' default string transform should remain enabled');
    assert.notEqual(String(ordinary.code).indexOf('captureHostStack()'),stringSource.indexOf('captureHostStack()'),
      mode+' default decoder prelude remains non-span-preserving');
  }
});

test('strict CommonJS Module._compile frame positions survive local property-span rewrites',()=>{
  const cjsSource="'use strict';const owner={longPrivatePropertyName:21};const value=owner.longPrivatePropertyName;captureHostStack();module.exports=value;";
  const output=obfuscateFiles([{
    path:'generated.cjs',sourceType:'commonjs',code:cjsSource
  }],{
    mode:'coo',closedWorld:false,seed:'agent1-cjs-property-frameposition',
    identifiers:false,strings:false,properties:true,
    experimentalLocalPropertySpanPreservation:true
  }).files[0];
  assert.equal(output.metrics.properties,1);
  assert.equal(String(output.code).length,cjsSource.length);
  /** @type {string[]} */
  const stacks=[];
  Object.defineProperty(globalThis,'captureHostStack',{
    configurable:true,value:()=>stacks.push(new Error('frame probe').stack??'')
  });
  /**
   * @param {string} code
   * @param {string} filename
   * @returns {unknown}
   */
  function compile(code,filename) {
    // Node exposes these CommonJS loader hooks at runtime, but @types/node
    // intentionally omits them from the public Module surface.
    /** @type {any} */
    const ModuleInternal=Module;
    /** @type {any} */
    const compiled=new ModuleInternal(filename);
    compiled.filename=filename;
    compiled.paths=ModuleInternal._nodeModulePaths(path.dirname(filename));
    compiled._compile(code,filename);
    return compiled.exports;
  }
  try {
    const nativePath=path.resolve('agent1-native-frame.cjs');
    const generatedPath=path.resolve('agent1-generated-frame.cjs');
    assert.equal(compile(cjsSource,nativePath),21);
    assert.equal(compile(String(output.code),generatedPath),21);
    assert.equal(stacks.length,2);
    const native=parseFrame(stacks[0],'agent1-native-frame.cjs');
    const generated=parseFrame(stacks[1],'agent1-generated-frame.cjs');
    process.stdout.write('AGENT1_CJS_PROPERTY_FRAMEPOSITION '+JSON.stringify({
      propertyRewrites:output.metrics.properties,native,generated
    })+'\\n');
    assert.equal(generated.line,native.line);
    assert.equal(generated.column,native.column,
      'strict CommonJS module-wrapper frame position must remain stable');
  } finally {
    Reflect.deleteProperty(globalThis,'captureHostStack');
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
      mode:'coo',closedWorld:false,seed:'agent1-property-frameposition-refusal',
      experimentalLocalPropertySpanPreservation:true,
      identifiers:false,strings:false,properties:true
    }).files[0];
    assert.equal(output.metrics.properties,0,fixture.name+' must not perform a width-unsafe or unsupported rewrite');
  }
});
