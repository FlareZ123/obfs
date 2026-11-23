'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {runBrowserChallenge}=require('../sims/sco-two-sided-affine-browser-inverse');

test('Chromium client recovers 16 32-bit SCO private affine-triangular targets after HttpOnly-CSP RPC shutdown',{
  timeout:120000,skip:process.env.OBFS_RUN_BROWSER_OFFLINE!=='1'
},async()=>{
  const report=await runBrowserChallenge();
  assert.equal(report.deniedWithoutCookie,403);
  assert.equal(report.privateSourceLeaked,false);
  assert.equal(report.authorizedPrivateCalls,529);
  assert.equal(report.disabledAt,529);
  assert.equal(report.onlineQueries,529);
  assert.equal(report.targetCount,16);
  assert.equal(report.offlineRecoveries,16);
  assert.equal(report.offlineModelEvaluations,16);
  assert.equal(report.sessionCookieReadable,false);
  assert.equal(report.privateDisabledBeforeInversion,true);
  assert.equal(report.browserExecuted,true);
  assert.ok(report.publishedBytes<report.privateSourceBytes);
  assert.match(report.csp,/script-src 'self'/u);
  console.log('SCO_TWO_SIDED_BROWSER_529 '+JSON.stringify(report));
});
