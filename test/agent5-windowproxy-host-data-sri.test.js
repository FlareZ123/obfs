'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {obfuscateFiles}=require('../src/core');
const {parse,observesDistributedSource}=require('../src/ast');

/** @typedef {import('../src/core').SourceFile} SourceFile */

/**
 * The embedding HTML is not a compiler input: it supplies the original SRI
 * digest through data-pin-value and the exact property name "integrity"
 * through data-pin-key. A source entry that can access window.top.document
 * can synthesize a modulepreload link from those externally supplied values,
 * without any static SRI literal, fetch(), FileReader or source-reader name.
 *
 * The browser loader's SRI events observe the exact bytes of leaf.mjs.
 * @returns {SourceFile[]}
 */
function graph(){
  return [
    {path:'leaf.mjs',sourceType:'module',
      code:'const record={privateField:23};const value=record.privateField;export function leaf(){return value;}'},
    {path:'entry.mjs',sourceType:'module',
      code:[
        "import {leaf} from './leaf.mjs';",
        "const doc=window.top['document'];",
        "const link=doc.createElement('link');",
        "link.rel='modulepreload';",
        "link.href='./leaf.mjs?check=1';",
        "const field=doc.body.dataset.pinKey;",
        "link[field]=doc.body.dataset.pinValue;",
        "doc.head.append(link);",
        "export const answer=leaf();"
      ].join('\n')}
  ];
}

test('nested global WindowProxy can expose an externally supplied source-byte SRI pin',()=>{
  const files=graph();
  const entry=parse(String(files[1].code),'module');
  assert.equal(observesDistributedSource(entry),true,
    'window.top.document must not be treated as a harmless object property');
  for(const mode of /** @type {const} */ (['coo','sno','sco'])){
    const result=obfuscateFiles(files,{
      mode,closedWorld:true,
      seed:'agent5-host-dataset-runtime-pin-'+mode,
      strings:false,identifiers:false
    });
    const output=result.files.find(file=>file.path==='leaf.mjs');
    assert.ok(output,mode);
    assert.equal(output.metrics.properties,0,mode+': externally pinned leaf bytes may not change');
    assert.equal(output.code,files[0].code,mode+': exact SRI byte parity');
  }
});

test('strict identity comparison using WindowProxy property needs no source-byte guard',()=>{
  /** @type {SourceFile[]} */
  const files=[
    {path:'leaf.mjs',sourceType:'module',
      code:'const privateRecord={secretAlpha:23};const value=privateRecord.secretAlpha;export function leaf(){return value;}'},
    {path:'entry.mjs',sourceType:'module',
      code:"import {leaf} from './leaf.mjs';const isTop=window.top===window;void isTop;void leaf();"}
  ];
  const entry=parse(String(files[1].code),'module');
  assert.equal(observesDistributedSource(entry),false,
    'an identity-only comparison cannot inspect sibling response bytes');
  const result=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'agent5-windowproxy-member-identity-positive',
    strings:false,identifiers:false
  });
  assert.ok((result.files.find(file=>file.path==='leaf.mjs')?.metrics.properties??0)>0,
    'ordinary identity checks should retain local private-field renaming');
});

module.exports={graph};
