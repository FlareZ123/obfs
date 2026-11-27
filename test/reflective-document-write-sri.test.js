'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');

/**
 * Function.prototype.call/apply and Reflect.apply invoke a Document writer
 * with a real Document receiver, preserving HTML parser SRI semantics.
 */
test('reflective Document writer invocation preserves pinned source bytes',()=>{
  const source='globalThis.reflectiveDocumentWriterSRI="source exposed through Function.call and Reflect.apply";';
  const hash=createHash('sha256').update(source).digest('base64');
  const markup='<script src="./client.js" integrity="sha256-'+hash+'"></script>';
  const raw=JSON.stringify(markup);
  const cases=[
    ['member call','document.write.call(document,'+raw+');'],
    ['member apply','document.write.apply(document,['+raw+']);'],
    ['Reflect.apply','Reflect.apply(document.write,document,['+raw+']);'],
    ['writer alias call','const writer=document.write;writer.call(document,'+raw+');'],
    ['writer alias reflect','const writer=document.write;Reflect.apply(writer,document,['+raw+']);'],
    ['bound writer','const writer=document.write.bind(document);writer('+raw+');']
  ];
  const files=[
    {path:'client.js',sourceType:/** @type {const} */('script'),code:source},
    {path:'index.html',sourceType:/** @type {const} */('asset'),
      code:Buffer.from('<script src="./bootstrap.js"></script>')}
  ];
  for(const mode of /** @type {const} */(['coo','sco','sno'])) {
    const options={mode,seed:'reflective-document-write/'+mode,
      strings:true,identifiers:false,properties:false};
    const harmless=obfuscateFiles([
      files[0],{path:'bootstrap.js',sourceType:'script',
        code:'document.write.call(document,"<p>harmless unpinned markup</p>");'},files[1]
    ],options);
    assert.notEqual(harmless.files[0].code,source,
      'A proved benign reflective write must retain rewrite yield in '+mode);
    for(const [kind,bootstrap] of /** @type {[string,string][]} */([
      ['member apply','document.write.apply(document,["<p>no integrity</p>"]);'],
      ['Reflect.apply','Reflect.apply(document.write,document,["<p>safe</p>"]);'],
      ['alias call','const writer=document.write;writer.call(document,"<p>safe</p>");']
    ])) {
      const benignOutput=obfuscateFiles([
        files[0],{path:'bootstrap.js',sourceType:'script',code:bootstrap},files[1]
      ],options);
      assert.notEqual(benignOutput.files[0].code,source,
        kind+' with proved unrelated HTML must preserve transformation yield in '+mode);
    }
    const unrelated=obfuscateFiles([
      files[0],{path:'bootstrap.js',sourceType:'script',
        code:'const f={call(_doc,txt){return txt;}};f.call(document,'+raw+');'},files[1]
    ],options);
    assert.notEqual(unrelated.files[0].code,source,
      'An unrelated local call method may accept SRI-looking text in '+mode);
    for(const [label,bootstrap] of cases) {
      const output=obfuscateFiles([
        files[0],{path:'bootstrap.js',sourceType:'script',code:bootstrap},files[1]
      ],options);
      assert.equal(output.files[0].code,source,
        label+' could insert a hash-pinned JavaScript script in '+mode);
    }
  }
});
