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


test('separately distributed classic script may replace native Node factory before insertion',()=>{
  const original='globalThis.sharedFactoryObservation="the original source must stay intact";';
  const poison='document.createElement=function make() {'+
    'return function inspect(){const privateLocal=37;return privateLocal;};};';
  const loader='const script=document.createElement("script");'+
    'document.head.append(script);';
  for(const mode of /** @type {const} */(['coo','sno','sco'])) {
    const out=obfuscateFiles([
      {path:'client.js',sourceType:'script',code:original},
      {path:'poison.js',sourceType:'script',code:poison},
      {path:'bootstrap.js',sourceType:'script',code:loader},
      {path:'index.html',sourceType:'asset',code:Buffer.from(
        '<script src="./poison.js"></script><script src="./bootstrap.js"></script>')}
    ],{mode,strings:true,properties:false,identifiers:false,
      seed:'agent1-crossfile-node-factory-poison/'+mode});
    assert.equal(out.files[0].code,original,
      'Syntactically native factory call can be shadowed by a preceding sibling '+mode);
  }
});


test('alias, destructuring, prototype and Reflect factory writes all veto sibling provenance',()=>{
  const body='function(){return function inspect(){const privateLocal=91;return privateLocal;};}';
  const poisonSources=[
    'const host=window;host.document.createElement='+body+';',
    'const {document:d}=globalThis;d.createElement='+body+';',
    'const d=document;Reflect.set(d,"createElement",'+body+');',
    'const C=Document;C.prototype.createElement='+body+';',
    'const d=window.document;Object.defineProperty(d,"createElement",{value:'+body+'});',
    'const d=new Proxy(document,{});d.createElement='+body+';',
    'const setter=Reflect.set;setter(document,"createElement",'+body+');',
    'const define=Object.defineProperty;define(document,"createElement",{value:'+body+'});'
  ];
  const original='globalThis.nativeNodeVeto="the sibling factory write can alter DOMString coercion";';
  const loader='const node=document.createElement("script");'+
    'document.head.append(node);';
  for(const source of poisonSources) {
    const output=obfuscateFiles([
      {path:'client.js',sourceType:'script',code:original},
      {path:'other.js',sourceType:'script',code:source},
      {path:'bootstrap.js',sourceType:'script',code:loader}
    ],{mode:'coo',seed:'agent1-alias-doc-factory-veto/'+source,
      strings:true,properties:false,identifiers:false});
    assert.equal(output.files[0].code,original,
      'Native factory alias can invalidate a Node brand assumption: '+source);
  }
});


test('unlisted executable HTML script can mutate native document factory before loader',()=>{
  const original='globalThis.opaqueScriptObservation="original bytes remain needed for unknown host scripts";';
  const loader='const script=document.createElement("script");'+
    'script.src="./client.js";document.head.append(script);';
  const html=Buffer.from('<!doctype html><html><body>'+
    '<script src="./unlisted-factory-patch.js"></script>'+
    '<script src="./bootstrap.js"></script></body></html>');
  for(const mode of /** @type {const} */(['coo','sno','sco'])) {
    const out=obfuscateFiles([
      {path:'client.js',sourceType:'script',code:original},
      {path:'bootstrap.js',sourceType:'script',code:loader},
      {path:'index.html',sourceType:'asset',code:html}
    ],{mode,seed:'agent1-unlisted-executable-host-script/'+mode,
      strings:true,properties:false,identifiers:false});
    assert.equal(out.files[0].code,original,
      'Unreviewed HTML script can replace factory before native Node insertion '+mode);
  }
});


test('unlisted dynamic script load invalidates later native Node factory provenance',()=>{
  const original='globalThis.dynamicUnlistedSource="a remote script could modify DOM factories before onload";';
  const unknown='const injected=document.createElement("script");'+
    'injected.src="./unlisted-script.js";'+
    'injected.onload=()=>{const node=document.createElement("script");'+
    'document.head.append(node);};'+
    'document.head.append(injected);';
  const known='const injected=document.createElement("script");'+
    'injected.src="./client.js";document.head.append(injected);';
  const image='const picture=document.createElement("img");'+
    'picture.src="./unlisted-picture.png";document.body.append(picture);';
  for(const mode of /** @type {const} */(['coo','sno','sco'])) {
    for(const [name,source,expectRewrite] of /** @type {const} */([
      ['remote-script',unknown,false],['known-script',known,true],
      ['native-image',image,true]
    ])){
      const out=obfuscateFiles([
        {path:'client.js',sourceType:'script',code:original},
        {path:'bootstrap.js',sourceType:'script',code:source},
        {path:'index.html',sourceType:'asset',
          code:Buffer.from('<script src="./bootstrap.js"></script>')}
      ],{mode,strings:true,properties:false,identifiers:false,
        seed:'agent1-unlisted-dynamic-browser-load/'+mode+'/'+name});
      assert.equal(out.files[0].code!==original,expectRewrite,
        name+' '+mode+' must distinguish executable external source from a native image');
    }
  }
});
