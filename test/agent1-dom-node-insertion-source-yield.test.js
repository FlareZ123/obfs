'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

/** @param {string} input @returns {boolean} */
function exposed(input) {
  return observesFunctionSource(parse(input,'script'));
}

/**
 * An actual browser Node passed to Element.append/replaceChildren is inserted
 * by brand without DOMString conversion. Unknown values may instead be a
 * callable and must retain Function#toString source protection.
 */
test('proven immutable native Node arguments do not create synthetic source observations',()=>{
  const safe=[
    'const script=document.createElement("script");document.head.append(script);',
    'const node=document.createTextNode("literal");document.body.append(node);',
    'const frag=document.createDocumentFragment();document.body.replaceChildren(frag);',
    'const node=document.createElementNS("http://www.w3.org/2000/svg","svg");document.body.prepend(node);'
  ];
  for(const source of safe)
    assert.equal(exposed(source),false,'Native Node must not coerce to a callable source: '+source);
});

test('unknown, shadowed, mutable and callable DOM insertion arguments remain source observers',()=>{
  const unsafe=[
    'function inspect(){const privateLocal=7;return privateLocal;}document.head.append(inspect);',
    'const node=document.createElement("script");function use(node){document.head.append(node);}',
    'let node=document.createElement("script");node=hostFunction;document.head.append(node);',
    'const node=hostFactory();document.head.append(node);',
    'const node=document.createElement("script");eval("void 0");document.head.append(node);',
    'const node=document.createElement("script");document.createElement=hostFactory;document.head.append(node);',
    'const node=document.createElement("script");const method=globalThis.method;document.head[method](node);'
  ];
  for(const source of unsafe)
    assert.equal(exposed(source),true,'Unproved DOM insertion remains guarded: '+source);
});

test('real no-SRI dynamic script mount retains client string-obfuscation yield in all three modes',()=>{
  const code='globalThis.dynamicSRI="a dynamically created script preserves original source bytes";';
  const bootstrap='const script=document.createElement("script");'+
    'script.src="./client.js";document.head.append(script);';
  for(const mode of /** @type {const} */(['coo','sno','sco'])) {
    const files=[
      {path:'client.js',sourceType:/** @type {const} */('script'),code},
      {path:'bootstrap.js',sourceType:/** @type {const} */('script'),code:bootstrap},
      {path:'index.html',sourceType:/** @type {const} */('asset'),
        code:Buffer.from('<script src="./bootstrap.js"></script>')}
    ];
    const emitted=obfuscateFiles(files,{mode,strings:true,properties:false,
      identifiers:false,seed:'agent1-native-dom-node-insert-'+mode});
    assert.notEqual(emitted.files[0].code,code,
      'An ordinary unpinned native Node insertion must not globally disable protection in '+mode);
  }
});
