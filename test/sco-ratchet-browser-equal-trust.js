'use strict';

const assert=require('node:assert/strict');
const {randomBytes,createHash}=require('node:crypto');
const {transform,version}=require('esbuild');
const {ordinarySource}=require('../sims/sco-ratchet-minifier-control');
const {createScoRpcClientSource}=require('../src');
const {main:runHostileBrowser}=require('./sco-ratchet-browser-attacker');

/** @param {string} source @returns {string} */
function sha256(source){
  return createHash('sha256').update(source).digest('hex');
}

/**
 * Equal private root, identical instrumented browser attacker and HttpOnly
 * same-origin cookie policy, testing both public facade variants in Chromium.
 * The two harness calls separately assert exact original output parity and
 * that hostile fetch interception captures all three private responses.
 * @returns {Promise<void>}
 */
async function main(){
  const root=randomBytes(32);
  const generated=createScoRpcClientSource(['batch']);
  const minified=(await transform(ordinarySource,{
    loader:'js',format:'esm',target:'es2022',minify:true,legalComments:'none'
  })).code;
  assert.notEqual(generated,minified);
  await runHostileBrowser(undefined,root);
  await runHostileBrowser(minified,root);
  console.log('SCO_EQUAL_TRUST_BROWSER '+JSON.stringify({
    node:process.version,platform:process.platform,esbuild:version,
    generatedSha256:sha256(generated),minifiedSha256:sha256(minified),
    samePrivateRoot:true,hostileBrowserTests:2,
    interceptedRpcResponsesPerFacade:2,originalEventsPerFacade:3,
    nonExtractableHttpOnlyCookieVisibleLength:0,
    caveat:'Two live local Chromium sessions; no production RTT, same-account anti-relay, or CPU budget guarantee.'
  }));
}

if(require.main===module){
  main().catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={main};
