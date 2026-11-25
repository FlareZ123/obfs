'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {runChromium}=require('../sims/agent9-browser-cdp-budget');

test('CDP ScriptDuration and TaskDuration measure current COO initialization and runtime',{
  skip:process.platform==='linux'?false:'CDP browser CPU prototype currently targets the Linux Chrome runner'
},async()=>{
  const result=await runChromium({count:1000000,trials:15});
  assert.equal(result.rows.length,15);
  assert.equal(result.scriptBudget.samplePairs,15);
  assert.equal(result.taskBudget.samplePairs,15);
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
    samples:result.rows.map(row=>({
      trial:row.trial,
      nativeScriptMs:row.native.scriptMs,
      protectedScriptMs:row.protected.scriptMs,
      scriptRatio:row.protected.scriptMs/row.native.scriptMs,
      nativeTaskMs:row.native.taskMs,
      protectedTaskMs:row.protected.taskMs,
      taskRatio:row.protected.taskMs/row.native.taskMs,
      result:row.native.result
    })),
    scope:result.scope
  }));
});
