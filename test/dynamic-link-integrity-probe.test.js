'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');

/** @typedef {{path:string,sourceType:'script'|'asset',code:string|Buffer}} Source */

/**
 * HTMLLinkElement.integrity is an active byte-level dependency for link
 * rel=preload/modulepreload, even if a runtime-selected key carries the
 * integrity property and the expected hash is delivered out of band.
 */
test('dynamic link integrity key conserves published JavaScript bytes',()=>{
  const client='globalThis.dynamicLinkSri="preloaded integrity source";';
  const html=/** @type {Source} */({
    path:'index.html',sourceType:'asset',
    code:Buffer.from('<!doctype html><script src="./bootstrap.js"></script>')
  });
  const bootstrap=(/** @type {string} */ assignment)=>[
    'const link=document.createElement("link");',
    'link.rel="preload";link.as="script";link.href="./client.js";',
    assignment,
    'document.head.append(link);'
  ].join('');
  for(const mode of /** @type {const} */(['coo','sco','sno'])){
    const options={mode,seed:'dynamic-link-integrity/'+mode,
      strings:true,identifiers:false,properties:false};
    const target=/** @type {Source} */({
      path:'client.js',sourceType:'script',code:client
    });
    const positive=obfuscateFiles([target,{
      path:'bootstrap.js',sourceType:/** @type {const} */('script'),
      code:bootstrap('link.title="unrelated";')
    },html],options);
    assert.notEqual(positive.files[0].code,client,
      'Non-SRI link property must retain rewriting yield in '+mode);
    const dynamic=obfuscateFiles([target,{
      path:'bootstrap.js',sourceType:/** @type {const} */('script'),
      code:bootstrap('const field=globalThis.linkField||"integrity";'+
        'link[field]=globalThis.externalExpectedIntegrity;')
    },html],options);
    assert.equal(dynamic.files[0].code,client,
      'Opaque key may set link integrity in '+mode);
  }
});
