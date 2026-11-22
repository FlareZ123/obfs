'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');

/** @typedef {{path:string,sourceType:'script'|'asset',code:string|Buffer}} Source */

/**
 * A reader may choose Document.write or Document.writeln through an opaque
 * property selector. The selected method's name is unknown to the scanner.
 */
test('opaque Document writer method can synthesize a real SRI commitment',()=>{
  const original='globalThis.opaqueDocumentWriterSRI="pinned sibling bytes through an unknown method";';
  const digest=createHash('sha256').update(original).digest('base64');
  const markup='<script src="./client.js" integrity="sha256-'+digest+'"></script>';
  const writer='const selected=globalThis.optionalDocumentWriter||"write";';
  const readers=[
    ['document direct',writer+'document[selected]('+JSON.stringify(markup)+');'],
    ['aliased document',writer+'const doc=document;doc[selected]('+JSON.stringify(markup)+');'],
    ['global document',writer+'globalThis.document[selected]('+JSON.stringify(markup)+');'],
    ['destructured document',writer+'const {document:doc}=window;doc[selected]('+JSON.stringify(markup)+');'],
    ['writeln default','const selected=globalThis.optionalDocumentWriter||"writeln";'+
      'document[selected]('+JSON.stringify(markup)+');']
  ];
  const client={path:'client.js',sourceType:/** @type {const} */('script'),code:original};
  const html={path:'index.html',sourceType:/** @type {const} */('asset'),
    code:Buffer.from('<script src="./bootstrap.js"></script>')};
  for(const mode of /** @type {const} */(['coo','sco','sno'])){
    const options={mode,seed:'opaque-document-writer/'+mode,
      strings:true,identifiers:false,properties:false};
    const benign=writer+'document[selected]("<p>benign unpinned markup</p>");';
    const control=obfuscateFiles([
      client,{path:'bootstrap.js',sourceType:'script',code:benign},html
    ],options);
    assert.notEqual(control.files[0].code,original,
      'Unknown Document writer with known benign markup must permit rewriting in '+mode);
    const knownUnrelated=obfuscateFiles([
      client,{path:'bootstrap.js',sourceType:'script',
        code:'document.querySelector('+JSON.stringify(markup)+');'},html
    ],options);
    assert.notEqual(knownUnrelated.files[0].code,original,
      'Proved non-writer method may receive an SRI-looking string in '+mode);
    for(const [label,bootstrap] of readers){
      const result=obfuscateFiles([
        client,{path:'bootstrap.js',sourceType:'script',code:bootstrap},html
      ],options);
      assert.equal(result.files[0].code,original,
        label+' may select a real parser-writer in '+mode);
    }
  }
});
