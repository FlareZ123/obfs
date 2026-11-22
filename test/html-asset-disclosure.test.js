'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles,createScoHandler}=require('../src');
const {findInlineHtmlSource,isEmbeddedExecutableUrl}=require('../src/html-assets');
const {atomicWrite}=require('../src/atomic');

const js={path:'entry.mjs',sourceType:'module',code:'export const answer=23;'};

/** @param {string} html @param {'coo'|'sco'|'sno'} mode */
function compile(html,mode) {
  return obfuscateFiles([
    js,{path:'index.html',sourceType:'asset',code:Buffer.from(html)}
  ],{mode,seed:'inline-source-audit',strings:false,identifiers:false,properties:false});
}

test('HTML5 parser detects inline source across browser execution contexts',()=>{
  const cases=[
    ['inline classic script','<!doctype html><script>window.secret=19;</script>'],
    ['inline module','<script type="module">import {x} from "./entry.mjs";window.secret=x;</script>'],
    ['inline data script payload','<script type="application/json">{"privateSource":"function sensitive(){}"}</script>'],
    ['mixed-case HTML and script','<ScRiPt>window.secret=1</sCrIpT>'],
    ['DOM event handler','<img src="missing.png" OnErRoR="window.secret=20">'],
    ['event handler nested in template','<template><button onclick="window.secret=21">x</button></template>'],
    ['script nested in template','<template><script>window.secret=22</script></template>'],
    ['iframe srcdoc source','<iframe srcdoc="&lt;script&gt;window.secret=23&lt;/script&gt;"></iframe>'],
    ['entity-encoded javascript href','<a href="java&#x73;cript:window.secret=24">go</a>'],
    ['ASCII controls in javascript URL','<a href="java&#10;script:window.secret=25">go</a>'],
    ['embedded HTML data URL','<iframe src="data:text/html;base64,PHNjcmlwdD4="></iframe>'],
    ['embedded SVG data URL','<object data="data:image/svg+xml,%3Csvg%20onload%3Dalert(1)%3E"></object>'],
    ['XHTML document data URL','<iframe src="data:application/xhtml+xml,%3Chtml%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F1999%2Fxhtml%22%3E%3Cscript%3Ewindow.secret%3D44%3C%2Fscript%3E%3C%2Fhtml%3E"></iframe>'],
    ['XML document data URL','<object data="data:application/xml,%3Chtml%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F1999%2Fxhtml%22%3E%3Cscript%3Ewindow.secret%3D45%3C%2Fscript%3E%3C%2Fhtml%3E"></object>'],
    ['XML text document data URL','<iframe src="data:text/xml,%3Chtml%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F1999%2Fxhtml%22%3E%3Cscript%3Ewindow.secret%3D46%3C%2Fscript%3E%3C%2Fhtml%3E"></iframe>'],
    ['meta refresh embedded HTML','<meta http-equiv="ReFrEsH" content="0; URL=data:text/html,&lt;script&gt;window.secret=27&lt;/script&gt;">'],
    ['meta refresh javascript URL','<meta content="0; URL=java&#x73;cript:window.secret=28" http-equiv="refresh">'],
    ['embedded source data script','<script src="data:text/javascript,window.secret=26"></script>'],
    ['unrecognized script data MIME still refused','<script src="data:application/octet-stream;base64,AAAA"></script>'],
    ['script data scheme obscured by HTML newline entity','<script src="da&#10;ta:application/octet-stream;base64,AAAA"></script>'],
    ['script data scheme obscured by HTML tab entity','<script src="d&#9;ata:application/octet-stream;base64,AAAA"></script>']
  ];
  for(const [name,html] of cases) {
    assert.ok(findInlineHtmlSource(html),name);
    for(const mode of ['coo','sco','sno']) {
      assert.throws(()=>compile(html,mode),/HTML asset contains/,name+' '+mode);
    }
    assert.throws(()=>createScoHandler([
      {path:'index.html',sourceType:'asset',code:html}
    ]),/HTML asset contains/,name+' SCO publication');
  }
});

test('HTML inline style elements refuse source-map comments with original source contents',()=>{
  const map=Buffer.from(JSON.stringify({
    version:3,sources:['unobfuscated-original.js'],
    sourcesContent:['const PRIVATE_HTML_STYLE_CANARY=921084;'],
    names:['PRIVATE_HTML_STYLE_CANARY'],mappings:'AAAA'
  })).toString('base64');
  const hostile=[
    '<!doctype html><style>body{color:red}/*# sourceMappingURL=data:application/json;base64,'+map+' */</style>',
    '<html><head><style>/*@ sourceMappingURL=../private.css.map */</style></head></html>',
    '<template><style>/*# sourceMappingURL=./original.map */</style></template>'
  ];
  for(const html of hostile) {
    assert.equal(findInlineHtmlSource(html),'inline CSS source-map directive');
    for(const mode of /** @type {const} */ (['coo','sco','sno'])) {
      assert.throws(()=>compile(html,mode),/HTML asset contains inline CSS source-map directive/,mode);
    }
    assert.throws(()=>createScoHandler([
      {path:'index.html',sourceType:'asset',code:html}
    ]),/HTML asset contains inline CSS source-map directive/);
  }
  const safe='<!doctype html><style>body::before{content:"/*# sourceMappingURL=example.map */"}body{color:#123}</style>';
  assert.equal(findInlineHtmlSource(safe),null);
  for(const mode of /** @type {const} */ (['coo','sco','sno'])) {
    const asset=compile(safe,mode).files.find(file=>file.path==='index.html');
    assert.ok(asset);
    assert.deepEqual(asset.code,Buffer.from(safe));
  }
});

test('external script and module URLs remain publishable without modifying HTML bytes',()=>{
  const html=[
    '<!doctype html><html><head><link rel="stylesheet" href="style.css"></head>',
    '<body><p id="answer">default</p>',
    '<script type="module" src="./entry.mjs"></script>',
    '<script src="https://cdn.example.test/library.js" defer></script>',
    '<a href="https://example.test/">link</a>',
    '<meta http-equiv="refresh" content="30; URL=https://example.test/next.html">',
    '<pre>&lt;script&gt;display only&lt;/script&gt;</pre>',
    '</body></html>'
  ].join('');
  assert.equal(findInlineHtmlSource(html),null);
  for(const mode of ['coo','sco','sno']) {
    const result=compile(html,mode);
    const asset=result.files.find(file=>file.path==='index.html');
    assert.ok(asset);
    assert.ok(Buffer.isBuffer(asset.code));
    assert.equal(asset.code.toString('utf8'),html);
  }
  assert.equal(typeof createScoHandler([
    {path:'index.html',sourceType:'asset',code:Buffer.from(html)}
  ]),'function');
});

test('URL detector decodes parser-normalized HTML attribute spellings',()=>{
  assert.equal(isEmbeddedExecutableUrl('java\nscript:alert(1)'),true);
  assert.equal(isEmbeddedExecutableUrl('DATA:TEXT/HTML,abc'),true);
  assert.equal(isEmbeddedExecutableUrl('data:image/svg+xml,<svg/>'),true);
  assert.equal(isEmbeddedExecutableUrl('data:application/xhtml+xml;charset=UTF-8,%3Chtml%3E'),true);
  assert.equal(isEmbeddedExecutableUrl('data:application/xml,%3Chtml%3E'),true);
  assert.equal(isEmbeddedExecutableUrl('data:text/xml,%3Chtml%3E'),true);
  assert.equal(isEmbeddedExecutableUrl('https://example.test/public.mjs'),false);
  assert.equal(isEmbeddedExecutableUrl('data:image/png;base64,AAA'),false);
  assert.equal(isEmbeddedExecutableUrl('data:application/json;base64,AAAA'),false);
});

test('HTML CLI source-disclosure refusal occurs before either COO or SNO emits output',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-inline-html-'));
  const input=path.join(root,'input');
  const output=path.join(root,'dist');
  try {
    await fs.mkdir(input);
    await atomicWrite(path.join(input,'entry.mjs'),js.code);
    await atomicWrite(path.join(input,'entry.cjs'),'module.exports=23;');
    await atomicWrite(path.join(input,'index.html'),'<script>window.privateSource="plaintext"</script>');
    for(const [mode,entry] of [['coo','entry.mjs'],['sno','entry.cjs']]) {
      const run=spawnSync(process.execPath,[
        path.join(__dirname,'../bin/'+mode+'.js'),
        '--root',input,'--entry',entry,'--out',output
      ],{encoding:'utf8'});
      assert.notEqual(run.status,0);
      assert.match(run.stderr,/HTML asset contains inline script source/);
      await assert.rejects(fs.stat(output),{code:'ENOENT'});
    }
  } finally {
    await fs.rm(root,{recursive:true,force:true});
  }
});

test('HTML source audit refuses UTF-16 BOM, NUL padding and malformed UTF-8',()=>{
  const inline='<script>window.utf16Secret=9</script>';
  const encoded=[
    Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from(inline,'utf16le')]),
    Buffer.from(inline,'utf16le'),
    Buffer.from([0xc0,0xaf,0x3c,0x73,0x63,0x72,0x69,0x70,0x74,0x3e])
  ];
  for(const bytes of encoded) {
    for(const mode of ['coo','sco','sno']) {
      assert.throws(()=>obfuscateFiles([
        js,{path:'hidden.html',sourceType:'asset',code:bytes}
      ],{mode}),/HTML asset (?:is not valid UTF-8|contains NUL)/,mode);
    }
    assert.throws(()=>createScoHandler([
      {path:'hidden.html',sourceType:'asset',code:bytes}
    ]),/HTML asset (?:is not valid UTF-8|contains NUL)/);
  }
  const utf8Bom=Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from('<p>safe</p>')]);
  for(const mode of ['coo','sco','sno']) {
    const result=obfuscateFiles([
      js,{path:'safe.html',sourceType:'asset',code:utf8Bom}
    ],{mode});
    const asset=result.files.find(file=>file.path==='safe.html');
    assert.ok(asset);
    assert.deepEqual(Buffer.from(asset.code),utf8Bom);
  }
});

test('declared HTML script SRI refuses byte-mutating JavaScript output',()=>{
  const source='globalThis.sriOutput="an unchanged source-boundary canary string";';
  const hash=require('node:crypto').createHash('sha256').update(source).digest('base64');
  const variants=[
    ['relative script','index.html','./client.js','script'],
    ['root script','index.html','/client.js','script'],
    ['encoded script','index.html','./%63lient.js?version=1#fragment','script'],
    ['parent script','pages/index.html','../client.js','script'],
    ['module preload','index.html','./client.js','modulepreload'],
    ['script preload','index.html','./client.js','preload'],
    ['declared HTML base','pages/index.html','./client.js','script','<base href="/">'],
    ['parent HTML base','pages/index.html','./client.js','script','<base href="../">'],
    ['absolute same-target path','index.html','https://deploy.example/client.js','script']
  ];
  for(const [label,htmlPath,href,kind,baseTag] of variants) {
    const tag=kind==='script' ?
      '<script src="'+href+'" integrity="sha256-'+hash+'"></script>' :
      '<link rel="'+kind+'" '+(kind==='preload'?'as="script" ':'')+
      'href="'+href+'" integrity="sha256-'+hash+'">';
    for(const mode of /** @type {const} */ (['coo','sco','sno'])) {
      const files=[
        {path:'client.js',sourceType:/** @type {const} */ ('script'),code:source},
        {path:htmlPath,sourceType:/** @type {const} */ ('asset'),
          code:Buffer.from('<!doctype html><html><head>'+(baseTag??'')+tag+'</head></html>')}
      ];
      const compiled=obfuscateFiles(files,{mode,closedWorld:true,
        seed:'html-sri/'+label+'/'+mode,strings:true,identifiers:false,properties:false});
      assert.equal(compiled.files[0].code,source,label+' '+mode+
        ': integrity metadata pins the exact original JavaScript response');
      assert.deepEqual(compiled.files[1].code,files[1].code);
    }
  }
});

test('SRI in unrelated external script does not disable eligible local obfuscation',()=>{
  const source='globalThis.sriOutput="an unchanged source-boundary canary string";';
  const files=[
    {path:'client.js',sourceType:/** @type {const} */ ('script'),code:source},
    {path:'index.html',sourceType:/** @type {const} */ ('asset'),
      code:Buffer.from('<script src="https://cdn.example.test/unrelated.js" '+
        'integrity="sha256-'+'a'.repeat(43)+'=" crossorigin="anonymous"></script>')}
  ];
  const compiled=obfuscateFiles(files,{
    mode:'coo',seed:'remote-sri-positive',strings:true,identifiers:false,properties:false
  });
  assert.notEqual(compiled.files[0].code,source);
  assert.ok(compiled.files[0].metrics.literals>0);
});

test('SCO public handler preserves SRI-pinned script response bytes',async()=>{
  const source='globalThis.sriOutput="an unchanged source-boundary canary string";';
  const hash=require('node:crypto').createHash('sha256').update(source).digest('base64');
  const handler=createScoHandler([
    {path:'client.js',sourceType:'script',code:source},
    {path:'index.html',sourceType:'asset',code:Buffer.from(
      '<script src="./client.js" integrity="sha256-'+hash+'"></script>')}
  ]);
  const server=require('node:http').createServer(handler);
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  try{
    const address=server.address();
    assert.ok(address&&typeof address==='object');
    const url='http://127.0.0.1:'+address.port+'/obfs/client.js';
    for(let index=0;index<2;index++){
      const response=await fetch(url);
      assert.equal(response.status,200);
      assert.equal(await response.text(),source);
    }
  }finally{
    await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve(undefined)));
  }
});

test('SCO closed-world cross-file property pass preserves an SRI-pinned ESM entry',async()=>{
  const source='export const state={secretField:23};';
  const entry='import {state} from "./state.mjs";console.log(state.secretField);';
  const files=[
    {path:'state.mjs',sourceType:/** @type {const} */('module'),code:source},
    {path:'entry.mjs',sourceType:/** @type {const} */('module'),code:entry}
  ];
  const control=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'sri-crossfile-positive',
    strings:false,identifiers:false,properties:true
  });
  assert.equal(control.crossFile.properties,1,
    'The unobserved ESM graph must expose a real prior cross-file rewrite');
  assert.notEqual(control.files[1].code,entry,
    'The SRI-pinned module is the actual cross-file rewrite target');
  const integrity=require('node:crypto').createHash('sha256').update(entry).digest('base64');
  const pinned={path:'index.html',sourceType:/** @type {const} */('asset'),
    code:Buffer.from('<script type="module" src="./entry.mjs" '+
      'integrity="sha256-'+integrity+'"></script>')};
  const handler=createScoHandler([...files,pinned],{closedWorld:true});
  const server=require('node:http').createServer(handler);
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  try{
    const addr=server.address();
    assert.ok(addr&&typeof addr==='object');
    const origin='http://127.0.0.1:'+addr.port;
    const result=await fetch(origin+'/obfs/entry.mjs');
    assert.equal(result.status,200);
    assert.equal(await result.text(),entry,
      'Cross-file renaming must not invalidate a pinned ESM integrity attribute');
  }finally{
    await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve(undefined)));
  }
});

test('SRI source commitment rejects a byte-changing host guard in both publishers',()=>{
  const script='globalThis.hostGuardPin="an external script integrity commitment";';
  const integrity=require('node:crypto').createHash('sha256').update(script).digest('base64');
  const sources=[
    {path:'client.js',sourceType:/** @type {const} */('script'),code:script},
    {path:'index.html',sourceType:/** @type {const} */('asset'),code:Buffer.from(
      '<script src="./client.js" integrity="sha256-'+integrity+'"></script>')}
  ];
  assert.throws(()=>obfuscateFiles(sources,{
    mode:'coo',seed:'sri-host-guard-refusal',allowedHosts:['allowed.example'],
    strings:false,identifiers:false,properties:false
  }),/Host locking cannot preserve observable source bytes/u);
  assert.throws(()=>createScoHandler(sources,{
    allowedHosts:['allowed.example']
  }),/Host locking cannot preserve observable source bytes/u);
});

test('ordinary local script without SRI retains explicit string obfuscation',()=>{
  const source='globalThis.sriOutput="an unchanged source-boundary canary string";';
  const files=[
    {path:'client.js',sourceType:/** @type {const} */('script'),code:source},
    {path:'index.html',sourceType:/** @type {const} */('asset'),code:Buffer.from(
      '<script src="./client.js"></script>')}
  ];
  const compiled=obfuscateFiles(files,{
    mode:'coo',seed:'no-integrity-positive',strings:true,
    properties:false,identifiers:false
  });
  assert.notEqual(compiled.files[0].code,source);
  assert.ok(compiled.files[0].metrics.literals>0);
});

test('SCO route-prefix-qualified SRI paths preserve the exact served script',async()=>{
  const source='globalThis.sriOutput="an unchanged source-boundary canary string";';
  const integrity=require('node:crypto').createHash('sha256').update(source).digest('base64');
  for(const prefix of ['/obfs/','/protected/scripts/','/obfs%23/',
    '/obfs%25/','/obfs%5C/','/obfs%2F/']) {
    const html='<script src="'+prefix+'client.js" '+
      'integrity="sha256-'+integrity+'"></script>';
    const handler=createScoHandler([
      {path:'client.js',sourceType:'script',code:source},
      {path:'index.html',sourceType:'asset',code:Buffer.from(html)}
    ],{routePrefix:prefix});
    const server=require('node:http').createServer(handler);
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',()=>resolve(undefined));
    });
    try{
      const address=server.address();
      assert.ok(address&&typeof address==='object');
      const response=await fetch('http://127.0.0.1:'+address.port+prefix+'client.js');
      assert.equal(response.status,200);
      assert.equal(await response.text(),source,'SRI pins the mounted SCO script at '+prefix);
    }finally{
      await new Promise((resolve,reject)=>
        server.close(error=>error?reject(error):resolve(undefined)));
    }
  }
});

test('inert template base cannot redirect a later live script SRI target',()=>{
  const source='globalThis.sriOutput="an unchanged source-boundary canary string";';
  const integrity=require('node:crypto').createHash('sha256').update(source).digest('base64');
  const html='<html><head><template><base href="/unrelated/"></template>'+
    '<script src="./client.js" integrity="sha256-'+integrity+'"></script></head></html>';
  for(const mode of /** @type {const} */(['coo','sco','sno'])){
    const output=obfuscateFiles([
      {path:'client.js',sourceType:'script',code:source},
      {path:'index.html',sourceType:'asset',code:Buffer.from(html)}
    ],{mode,seed:'template-base-opaque/'+mode,
      strings:true,properties:false,identifiers:false});
    assert.equal(output.files[0].code,source,
      'A template DocumentFragment base is not an active document base in '+mode);
  }
});

test('a base element later than an SRI script cannot invalidate its original URL',()=>{
  const source='globalThis.sriOutput="an unchanged source-boundary canary string";';
  const integrity=require('node:crypto').createHash('sha256').update(source).digest('base64');
  const html='<html><head><script src="./client.js" '+
    'integrity="sha256-'+integrity+'"></script>'+
    '<base href="/unrelated/"></head></html>';
  for(const mode of /** @type {const} */(['coo','sco','sno'])){
    const output=obfuscateFiles([
      {path:'client.js',sourceType:'script',code:source},
      {path:'index.html',sourceType:'asset',code:Buffer.from(html)}
    ],{mode,seed:'late-base-original-url/'+mode,
      strings:true,properties:false,identifiers:false});
    assert.equal(output.files[0].code,source,'Protect the earlier script in '+mode);
  }
});


test('foreign SVG base cannot hide a later HTML base from SRI source-byte protection',()=>{
  const source='globalThis.svgBaseIntegrity="the declared live HTML base pins these original bytes";';
  const digest=require('node:crypto').createHash('sha256').update(source).digest('base64');
  const prefix='<!doctype html><html><body><svg><base href="/unrelated/"/></svg>'+
    '<base href="/assets/"><script src="./client.js" ';
  const html=prefix+'integrity="sha256-'+digest+'"></script></body></html>';
  const files=[
    {path:'assets/client.js',sourceType:/** @type {const} */ ('script'),code:source},
    {path:'pages/index.html',sourceType:/** @type {const} */ ('asset'),code:Buffer.from(html)}
  ];
  for(const mode of /** @type {const} */ (['coo','sco','sno'])){
    const options={mode,seed:'svg-foreign-base/'+mode,
      strings:true,identifiers:false,properties:false};
    const control=obfuscateFiles([
      files[0],
      {...files[1],code:Buffer.from(prefix+'></script></body></html>')}
    ],options);
    assert.notEqual(control.files[0].code,source,mode+
      ': positive control must confirm the chosen code actually transforms');
    const protectedFiles=obfuscateFiles(files,options);
    assert.equal(protectedFiles.files[0].code,source,mode+
      ': SVG <base> is not an HTMLBaseElement, so the live HTML base pins the script');
  }
});


test('a script dynamically inserted with integrity must retain the pinned sibling bytes',()=>{
  const source='globalThis.dynamicSRI="a dynamically created script preserves original source bytes";';
  const digest=require('node:crypto').createHash('sha256').update(source).digest('base64');
  const html='<html><head><script src="./bootstrap.js"></script></head><body></body></html>';
  const originalLoader='const script=document.createElement("script");'+
    'script.src="./client.js";script.integrity="sha256-'+digest+'";document.head.append(script);';
  const unpinnedLoader='const script=document.createElement("script");'+
    'script.src="./client.js";document.head.append(script);';
  for(const mode of /** @type {const} */(['coo','sco','sno'])){
    const opts={mode,seed:'dynamic-sri/'+mode,
      strings:true,properties:false,identifiers:false};
    const sourceFile={path:'client.js',sourceType:/** @type {const} */('script'),code:source};
    const asset={path:'index.html',sourceType:/** @type {const} */('asset'),code:Buffer.from(html)};
    const bootstrap={path:'bootstrap.js',sourceType:/** @type {const} */('script'),code:originalLoader};
    const control=obfuscateFiles([
      sourceFile,{...bootstrap,code:unpinnedLoader},asset
    ],opts);
    assert.notEqual(control.files[0].code,source,
      'No-integrity dynamic loader must admit actual client rewriting in '+mode);
    const result=obfuscateFiles([sourceFile,bootstrap,asset],opts);
    assert.equal(result.files[0].code,source,
      'DOM HTMLScriptElement.integrity pins original distributed script bytes in '+mode);
  }
});


test('dynamic SRI setter aliases and attribute writers are observed without penalizing pure data reads',()=>{
  const source='globalThis.dynamicSRISetter="a dynamically hashed sibling must keep its source";';
  const hash=require('node:crypto').createHash('sha256').update(source).digest('base64');
  const prefix='const script=document.createElement("script");script.src="./client.js";';
  const variants=[
    ['constant computed key','const key="integrity";script[key]="sha256-'+hash+'";'],
    ['concatenated computed key','script["inte"+"grity"]="sha256-'+hash+'";'],
    ['setAttribute','script.setAttribute("INTEGRITY","sha256-'+hash+'");'],
    ['setAttributeNS','script.setAttributeNS(null,"integrity","sha256-'+hash+'");'],
    ['Reflect.set','Reflect.set(script,"integrity","sha256-'+hash+'");'],
    ['Object.assign','Object.assign(script,{integrity:"sha256-'+hash+'"});']
  ];
  const client={path:'client.js',sourceType:/** @type {const} */('script'),code:source};
  const html={path:'index.html',sourceType:/** @type {const} */('asset'),
    code:Buffer.from('<script src="./bootstrap.js"></script>')};
  for(const mode of /** @type {const} */(['coo','sco','sno'])){
    const options={mode,seed:'dynamic-sri-method/'+mode,
      strings:true,identifiers:false,properties:false};
    for(const [name,setter] of variants){
      const bootstrap={path:'bootstrap.js',sourceType:/** @type {const} */('script'),
        code:prefix+setter+'document.head.append(script);'};
      const result=obfuscateFiles([client,bootstrap,html],options);
      assert.equal(result.files[0].code,source,
        name+' must recognize a dynamic integrity commitment in '+mode);
    }
    const dataRead='const data={integrity:17};'+
      'globalThis.dynamicReadOnlyIntegrity=data.integrity;';
    const output=obfuscateFiles([
      client,{path:'bootstrap.js',sourceType:'script',code:dataRead},html
    ],options);
    assert.notEqual(output.files[0].code,source,
      'Read-only data integrity fields must remain transformable in '+mode);
  }
});


test('SCO handler honors SRI dynamically assigned by another published script',async ()=>{
  const source='globalThis.dynamicSCO="the real SCO response has source-byte integrity";';
  const hash=require('node:crypto').createHash('sha256').update(source).digest('base64');
  const bootstrap='const script=document.createElement("script");'+
    'script.src="./client.js";script.integrity="sha256-'+hash+'";document.head.append(script);';
  const control=bootstrap.replace('script.integrity="sha256-'+hash+'";','');
  const script={path:'client.js',sourceType:/** @type {const} */('script'),code:source};
  const html={path:'index.html',sourceType:/** @type {const} */('asset'),
    code:Buffer.from('<script src="./bootstrap.js"></script>')};
  const observed=createScoHandler([
    script,{path:'bootstrap.js',sourceType:'script',code:bootstrap},html
  ],{routePrefix:'/obfs/'});
  const unobserved=createScoHandler([
    script,{path:'bootstrap.js',sourceType:'script',code:control},html
  ],{routePrefix:'/obfs/'});
  for(const [label,handler] of /** @type {const} */([
    ['integrity',observed],['no integrity',unobserved]
  ])){
    const server=require('node:http').createServer(handler);
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',()=>resolve(undefined));
    });
    try{
      const addr=server.address();
      assert.ok(addr&&typeof addr==='object');
      const response=await fetch('http://127.0.0.1:'+addr.port+'/obfs/client.js');
      assert.equal(response.status,200);
      const emitted=await response.text();
      if(label==='integrity')assert.equal(emitted,source);
      else assert.notEqual(emitted,source,
        'No-integrity live SCO control must actually mutate response bytes');
    }finally{
      await new Promise((resolve,reject)=>
        server.close(error=>error?reject(error):resolve(undefined)));
    }
  }
});


test('document.write-inserted integrity attribute pins original sibling script bytes',()=>{
  const source='globalThis.documentWriteSRI="parser-inserted SRI bytes must remain intact";';
  const hash=require('node:crypto').createHash('sha256').update(source).digest('base64');
  const pinned='document.write('+
    JSON.stringify('<script src="./client.js" integrity="sha256-'+hash+'"></script>')+');';
  const plain='document.write('+
    JSON.stringify('<script src="./client.js"></script>')+');';
  const client={path:'client.js',sourceType:/** @type {const} */('script'),code:source};
  const html={path:'index.html',sourceType:/** @type {const} */('asset'),
    code:Buffer.from('<script src="./bootstrap.js"></script>')};
  for(const mode of /** @type {const} */(['coo','sco','sno'])){
    const options={mode,seed:'document-write-sri/'+mode,strings:true,
      identifiers:false,properties:false};
    const control=obfuscateFiles([
      client,{path:'bootstrap.js',sourceType:'script',code:plain},html
    ],options);
    assert.notEqual(control.files[0].code,source,
      'No-integrity document.write control must transform in '+mode);
    const pinnedFiles=obfuscateFiles([
      client,{path:'bootstrap.js',sourceType:'script',code:pinned},html
    ],options);
    assert.equal(pinnedFiles.files[0].code,source,
      'DOM-written integrity metadata must pin sibling source bytes in '+mode);
  }
});


test('document-write SRI guard follows proven document aliases and opaque markup',()=>{
  const source='globalThis.aliasDocumentWriteSRI="the original parser-written script is pinned";';
  const hash=require('node:crypto').createHash('sha256').update(source).digest('base64');
  const markup=JSON.stringify('<script src="./client.js" INTEGRITY = "sha256-'+hash+'"></script>');
  const cases=[
    ['local alias','const doc=document;doc.write('+markup+');'],
    ['window.document alias','const doc=window.document;doc.writeln('+markup+');'],
    ['destructured document alias','const {document:doc}=globalThis;doc.write('+markup+');'],
    ['computed method','const method="wri"+"te";document[method]('+markup+');'],
    ['global member','globalThis.document.write('+markup+');'],
    ['computed global member','window["document"].writeln('+markup+');'],
    ['opaque parser write','const html=opaqueHtml();document.write(html);']
  ];
  const file={path:'client.js',sourceType:/** @type {const} */('script'),code:source};
  const html={path:'index.html',sourceType:/** @type {const} */('asset'),
    code:Buffer.from('<script src="./bootstrap.js"></script>')};
  for(const mode of /** @type {const} */(['coo','sco','sno'])){
    const options={mode,seed:'document-alias/'+mode,strings:true,
      properties:false,identifiers:false};
    for(const [name,code] of cases){
      const result=obfuscateFiles([
        file,{path:'bootstrap.js',sourceType:'script',code},html
      ],options);
      assert.equal(result.files[0].code,source,
        name+' must preserve possible parser-written SRI in '+mode);
    }
    const safe=obfuscateFiles([
      file,{path:'bootstrap.js',sourceType:'script',
        code:'const doc=document;doc.write("<p>an ordinary literal</p>");'},html
    ],options);
    assert.notEqual(safe.files[0].code,source,
      'A known unrelated literal document.write must keep transformation yield in '+mode);
  }
});


test('unknown computed DOM script integrity keys conservatively pin sibling source',()=>{
  const source='globalThis.computedScriptSRI="opaque property names may be integrity";';
  const hash=require('node:crypto').createHash('sha256').update(source).digest('base64');
  const prefix='const script=document.createElement("script");'+
    'script.src="./client.js";const attr=globalThis.optionalAttr||"integrity";';
  const cases=[
    ['computed write','script[attr]="sha256-'+hash+'";'],
    ['setAttribute','script.setAttribute(attr,"sha256-'+hash+'");'],
    ['Reflect.set','Reflect.set(script,attr,"sha256-'+hash+'");'],
    ['Object.assign','Object.assign(script,{[attr]:"sha256-'+hash+'"});']
  ];
  const html={path:'index.html',sourceType:/** @type {const} */('asset'),
    code:Buffer.from('<script src="./bootstrap.js"></script>')};
  const client={path:'client.js',sourceType:/** @type {const} */('script'),code:source};
  for(const mode of /** @type {const} */(['coo','sno','sco'])){
    const options={mode,seed:'computed-script-integrity/'+mode,
      strings:true,identifiers:false,properties:false};
    const control=obfuscateFiles([
      client,{path:'bootstrap.js',sourceType:'script',
        code:prefix+'document.head.append(script);'},html
    ],options);
    assert.notEqual(control.files[0].code,source,
      'No-SRI computed-key control must transform in '+mode);
    for(const [name,setter] of cases){
      const result=obfuscateFiles([
        client,{path:'bootstrap.js',sourceType:'script',
          code:prefix+setter+'document.head.append(script);'},html
      ],options);
      assert.equal(result.files[0].code,source,
        name+' on a known DOM script with an opaque key may set integrity in '+mode);
    }
  }
});

test('fragment marker in HTML filename must not hide a pinned relative JavaScript URL',()=>{
  const source='globalThis.fragmentFilenameSRI="original JS bytes must survive URL path encoding";';
  const digest=require('node:crypto').createHash('sha256').update(source).digest('base64');
  const html='<html><body><script src="../client.js" integrity="sha256-'+digest+'"></script></body></html>';
  const assets=[
    {path:'pages/client.js',sourceType:/** @type {const} */('script'),code:source},
    {path:'pages/hash#inside/index.html',sourceType:/** @type {const} */('asset'),code:Buffer.from(html)}
  ];
  for(const mode of /** @type {const} */(['coo','sco','sno'])){
    const options={mode,seed:'fragment-filename-sri/'+mode,
      strings:true,properties:false,identifiers:false};
    const unpinned=obfuscateFiles([
      assets[0],
      {...assets[1],code:Buffer.from('<html><body><script src="../client.js"></script></body></html>')}
    ],options);
    assert.notEqual(unpinned.files[0].code,source,
      'No-SRI positive control should actually obfuscate in '+mode);
    const pinned=obfuscateFiles(assets,options);
    assert.equal(pinned.files[0].code,source,
      'A fragment marker in the path is a filename byte, not a URL fragment in '+mode);
  }
});


test('literal percent in a declared HTML filename must be URL-escaped before SRI lookup',()=>{
  const source='globalThis.percentFilenameSRI="a literal percent sequence belongs to the filesystem";';
  const hash=require('node:crypto').createHash('sha256').update(source).digest('base64');
  const html='<html><head><script src="./client.js" integrity="sha256-'+hash+'"></script></head></html>';
  const inputs=[
    {path:'pages/percent%23inside/client.js',sourceType:/** @type {const} */('script'),code:source},
    {path:'pages/percent%23inside/index.html',sourceType:/** @type {const} */('asset'),code:Buffer.from(html)}
  ];
  for(const mode of /** @type {const} */(['coo','sno','sco'])){
    const options={mode,seed:'percent-filename/'+mode,
      strings:true,identifiers:false,properties:false};
    const control=obfuscateFiles([
      inputs[0],
      {...inputs[1],code:Buffer.from('<script src="./client.js"></script>')}
    ],options);
    assert.notEqual(control.files[0].code,source,
      'Positive no-SRI control must transform in '+mode);
    const result=obfuscateFiles(inputs,options);
    assert.equal(result.files[0].code,source,
      'A literal %23 filename segment is not a URL-encoded # in '+mode);
  }
});

test('XHTML SRI resolution must encode a fragment marker inside its source filename',()=>{
  const source='globalThis.xhtmlFragmentSRI="XHTML document filenames contain literal fragment marker";';
  const hash=require('node:crypto').createHash('sha256').update(source).digest('base64');
  const xhtml='<?xml version="1.0" encoding="utf-8"?>'+
    '<h:html xmlns:h="http://www.w3.org/1999/xhtml"><h:head>'+ 
    '<h:script src="../client.js" integrity="sha256-'+hash+'"/></h:head></h:html>';
  const inputs=[
    {path:'pages/client.js',sourceType:/** @type {const} */('script'),code:source},
    {path:'pages/hash#inside/index.xhtml',sourceType:/** @type {const} */('asset'),code:Buffer.from(xhtml)}
  ];
  for(const mode of /** @type {const} */(['coo','sno','sco'])){
    const options={mode,seed:'xhtml-fragment-filename/'+mode,
      strings:true,identifiers:false,properties:false};
    const control=obfuscateFiles([
      inputs[0],
      {...inputs[1],code:Buffer.from('<h:html xmlns:h="http://www.w3.org/1999/xhtml"/>')}
    ],options);
    assert.notEqual(control.files[0].code,source,
      'XHTML no-SRI control must transform in '+mode);
    const result=obfuscateFiles(inputs,options);
    assert.equal(result.files[0].code,source,
      'XHTML XML URL proof must use the fully encoded source filename in '+mode);
  }
});


test('an imported script factory returning a DOM script may produce SRI through an opaque key',()=>{
  const source='globalThis.crossFileScriptSRI="returned DOM script carries this source hash";';
  const hash=require('node:crypto').createHash('sha256').update(source).digest('base64');
  const factory='export function build(){return document.createElement("script");}';
  const prefix='import {build} from "./factory.mjs";const script=build();'+
    'script.src="./client.js";const key=globalThis.sriProperty||"integrity";';
  const pinned=prefix+'script[key]="sha256-'+hash+'";document.head.append(script);';
  const unpinned=prefix+'document.head.append(script);';
  const base=[
    {path:'client.js',sourceType:/** @type {const} */('script'),code:source},
    {path:'factory.mjs',sourceType:/** @type {const} */('module'),code:factory},
    {path:'bootstrap.mjs',sourceType:/** @type {const} */('module'),code:pinned},
    {path:'index.html',sourceType:/** @type {const} */('asset'),
      code:Buffer.from('<script type="module" src="./bootstrap.mjs"></script>')}
  ];
  for(const mode of /** @type {const} */(['coo','sno','sco'])){
    const options={mode,seed:'interfile-script-integrity/'+mode,
      closedWorld:true,strings:true,identifiers:false,properties:false};
    const plain=obfuscateFiles([
      base[0],base[1],{...base[2],code:unpinned},base[3]
    ],options);
    assert.notEqual(plain.files[0].code,source,
      'Without SRI an imported DOM factory must retain client rewrite yield in '+mode);
    const result=obfuscateFiles(base,options);
    assert.equal(result.files[0].code,source,
      'An imported script factory and opaque attribute name may pin bytes in '+mode);
  }
});
