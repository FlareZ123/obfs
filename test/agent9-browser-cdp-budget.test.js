'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {runChromium}=require('../sims/agent9-browser-cdp-budget');

test('CDP ScriptDuration and TaskDuration measure current COO initialization and runtime',{
  skip:process.platform==='linux'?false:'CDP browser CPU prototype currently targets the Linux Chrome runner'
},async()=>{
  const result=await runChromium({count:500000,trials:5});
  assert.equal(result.rows.length,5);
  assert.equal(result.scriptBudget.samplePairs,5);
  assert.equal(result.taskBudget.samplePairs,5);
  assert.ok(Number.isFinite(result.scriptBudget.medianOfPairedRatios));
  assert.ok(Number.isFinite(result.taskBudget.medianOfPairedRatios));
  console.log('AGENT9_CDP_BROWSER_BUDGET '+JSON.stringify({
    chrome:result.chrome,
    node:result.node,
    count:result.count,
    trials:result.trials,
    compilerMetrics:result.compilerMetrics,
    scriptBudget:result.scriptBudget,
    taskBudget:result.taskBudget,
    sampleTotals:result.rows.map(row=>({
      trial:row.trial,
      nativeScriptMs:row.native.totalScriptMs,
      protectedScriptMs:row.protected.totalScriptMs,
      nativeTaskMs:row.native.totalTaskMs,
      protectedTaskMs:row.protected.totalTaskMs
    })),
    scope:result.scope
  }));
});
