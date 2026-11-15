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
    ['meta refresh embedded HTML','<meta http-equiv="ReFrEsH" content="0; URL=data:text/html,&lt;script&gt;window.secret=27&lt;/script&gt;">'],
    ['meta refresh javascript URL','<meta content="0; URL=java&#x73;cript:window.secret=28" http-equiv="refresh">'],
    ['embedded source data script','<script src="data:text/javascript,window.secret=26"></script>'],
    ['unrecognized script data MIME still refused','<script src="data:application/octet-stream;base64,AAAA"></script>']
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
  assert.equal(isEmbeddedExecutableUrl('https://example.test/public.mjs'),false);
  assert.equal(isEmbeddedExecutableUrl('data:image/png;base64,AAA'),false);
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
