'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src/core');
const {pairedBudgetBound}=require('../sims/paired-budget-bound');
const puppeteer=require('puppeteer-core');

const run=promisify(execFile);

/** @param {number} extraStrings @returns {string} */
function makeSource(extraStrings) {
  const lines=[
    '// UTF-16 coordinate prefix 😀',
    'const privateRecord = { privateField: 7 };',
    'function observed() { return 29; }',
    'const observedSource = Function.prototype.toString.call(observed);',
    "const label = 'safe-literal';",
    'export const result = privateRecord.privateField;',
    'export const sourceText = observedSource;',
    'export const labelText = label;'
  ];
  for(let index=0;index<extraStrings;index++) {
    const suffix=String(index).padStart(3,'0');
    lines.push(`const payload${suffix} = 'payload-value-${suffix}-with-enough-characters';`);
    lines.push(`export const payloadText${suffix} = payload${suffix};`);
  }
  return lines.join('\n');
}

const source=makeSource(0);

/** @returns {string} */
function page() {
  return '<!doctype html><html><head><meta charset="utf-8"></head><body>'+
    '<script type="module">try{const mod=await import("./entry.mjs");'+
    'const pre=document.createElement("pre");pre.id="result";'+
    'pre.textContent=btoa(JSON.stringify({result:mod.result,sourceText:mod.sourceText,labelText:mod.labelText}));'+
    'document.body.appendChild(pre);}catch(error){const pre=document.createElement("pre");'+
    'pre.id="failure";pre.textContent=String(error.stack||error);document.body.appendChild(pre);}</script>'+
    '</body></html>';
}

/**
 * Measure ESM evaluation in the real browser realm. Blob creation is outside
 * the timer; module parsing and evaluation are inside it. Each Blob URL is
 * unique, so each sample performs a fresh module initialization.
 * @param {Array<{label:string,nativeCode:string,emittedCode:string}>} workloads
 * @returns {string}
 */
function benchmarkPage(workloads) {
  return '<!doctype html><html><head><meta charset="utf-8"></head><body>'+
    '<script type="module">const workloads='+JSON.stringify(workloads)+';'+
    'const median=values=>{const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.floor(sorted.length/2)];};'+
    'const load=async code=>{const url=URL.createObjectURL(new Blob([code],{type:"text/javascript"}));'+
    'const start=performance.now();const namespace=await import(url);const elapsedMs=performance.now()-start;'+
    'URL.revokeObjectURL(url);const snapshot=Object.fromEntries(Object.keys(namespace).sort().map(key=>[key,namespace[key]]));'+
    'return {elapsedMs,snapshot};};'+
    'const main=async()=>{const reports=[];for(const workload of workloads){'+
    'const baselineSamplesMs=[];const obfuscatedSamplesMs=[];'+
    'for(let index=0;index<6;index++){const baseline=await load(workload.nativeCode);'+
    'const obfuscated=await load(workload.emittedCode);if(JSON.stringify(baseline.snapshot)!==JSON.stringify(obfuscated.snapshot))'+
    'throw new Error(workload.label+" warmup exports differ");}'+
    'for(let index=0;index<31;index++){let baseline,obfuscated;if(index%2===0){'+
    'baseline=await load(workload.nativeCode);obfuscated=await load(workload.emittedCode);}else{'+
    'obfuscated=await load(workload.emittedCode);baseline=await load(workload.nativeCode);}'+
    'if(JSON.stringify(baseline.snapshot)!==JSON.stringify(obfuscated.snapshot))'+
    'throw new Error(workload.label+" sample exports differ");'+
    'baselineSamplesMs.push(baseline.elapsedMs);obfuscatedSamplesMs.push(obfuscated.elapsedMs);}'+
    'const pairRatios=obfuscatedSamplesMs.map((value,index)=>value/baselineSamplesMs[index]);'+
    'const placeboLeftSamplesMs=[];const placeboRightSamplesMs=[];'+
    'for(let index=0;index<31;index++){let left,right;if(index%2===0){left=await load(workload.nativeCode);right=await load(workload.nativeCode);}else{right=await load(workload.nativeCode);left=await load(workload.nativeCode);}'+
    'if(JSON.stringify(left.snapshot)!==JSON.stringify(right.snapshot))throw new Error(workload.label+" placebo exports differ");'+
    'placeboLeftSamplesMs.push(left.elapsedMs);placeboRightSamplesMs.push(right.elapsedMs);}'+
    'const placeboPairRatios=placeboRightSamplesMs.map((value,index)=>value/placeboLeftSamplesMs[index]);'+
    'const strictBreachSamples=pairRatios.map((ratio,sample)=>({sample,ratio})).filter(item=>item.ratio>2.5);'+
    'const baselineMedianMs=median(baselineSamplesMs);const obfuscatedMedianMs=median(obfuscatedSamplesMs);'+
    'const ratio=obfuscatedMedianMs/baselineMedianMs;reports.push({workload:workload.label,sampleCount:31,warmupCount:6,'+
    'baselineSamplesMs,obfuscatedSamplesMs,pairRatios,medianPairRatio:median(pairRatios),maxPairRatio:Math.max(...pairRatios),'+
    'strictBreachCount:strictBreachSamples.length,strictBreachSamples,baselineMedianMs,obfuscatedMedianMs,ratio,'+
    'placeboLeftSamplesMs,placeboRightSamplesMs,placeboPairRatios,placeboMaxPairRatio:Math.max(...placeboPairRatios),'+
    'placeboStrictBreachCount:placeboPairRatios.filter(value=>value>2.5).length,budgetRatio:2.5,passesMedianBudget:ratio<=2.5});}return reports;};'+
    'try{const reports=await main();const pre=document.createElement("pre");pre.id="budget";pre.textContent=btoa(JSON.stringify(reports));'+
    'document.body.appendChild(pre);}catch(error){const pre=document.createElement("pre");pre.id="budget-failure";'+
    'pre.textContent=String(error.stack||error);document.body.appendChild(pre);}</script></body></html>';
}

/**
 * Compare Chromium ESM loader behavior and the module-evaluation budget for
 * native and emitted source. This is a pristine-intrinsics compatibility
 * control, not an attacker-resistant client integrity test.
 * @returns {Promise<{browser:string,properties:number,bindings:number,literals:number,exactSource:boolean,chromiumBudget:Array<Object>,chromiumBudgetBounds:Array<Object>}>}
 */
async function main() {
  const executable=process.env.CHROMIUM_BIN??'google-chrome';
  const version=await run(executable,['--version'],{encoding:'utf8',timeout:15000});
  const runtimeVersion=version.stdout.trim();
  assert.match(runtimeVersion,/(Chrome|Chromium)\s+\d+\./u);
  const hostContract={
    runtimeFamily:'Chromium',
    runtimeVersion,
    contractVersion:'coo-direct-function-source-v1',
    pristineIntrinsicsPremise:
      'Fresh page module realm with unmodified Function.prototype.toString, Function.prototype.call, and String.fromCharCode before module evaluation.'
  };
  const options={
    mode:'coo',
    seed:'direct-source-plan-chromium',
    strings:true,
    experimentalSourceObservationPlan:hostContract
  };
  const result=obfuscateFiles([{
    path:'entry.mjs',sourceType:'module',code:source
  }],options);
  const emitted=result.files[0];
  assert.ok(emitted&&typeof emitted.code==='string');
  assert.ok(emitted.metrics.properties>=1);
  assert.ok(emitted.metrics.bindings>=1);
  assert.ok(emitted.metrics.literals>=1);
  assert.ok(emitted.code.includes('function observed() { return 29; }'));

  const mediumSource=makeSource(32);
  const mediumResult=obfuscateFiles([{
    path:'entry.mjs',sourceType:'module',code:mediumSource
  }],{...options,seed:'direct-source-plan-chromium-medium'});
  const mediumEmitted=mediumResult.files[0];
  assert.ok(mediumEmitted&&typeof mediumEmitted.code==='string');
  assert.ok(mediumEmitted.metrics.properties>=1);
  assert.ok(mediumEmitted.metrics.bindings>=1);
  assert.ok(mediumEmitted.metrics.literals>=32);
  assert.ok(mediumEmitted.code.includes('function observed() { return 29; }'));

  const resources=new Map([
    ['/native/index.html',page()],
    ['/native/entry.mjs',source],
    ['/emitted/index.html',page()],
    ['/emitted/entry.mjs',emitted.code],
    ['/benchmark/index.html',benchmarkPage([
      {label:'small-one-literal',nativeCode:source,emittedCode:emitted.code},
      {label:'medium-32-literals',nativeCode:mediumSource,emittedCode:mediumEmitted.code}
    ])]
  ]);
  const server=http.createServer((request,response)=>{
    const pathname=new URL(request.url??'/','http://127.0.0.1').pathname;
    const body=resources.get(pathname);
    if(body===undefined){response.writeHead(404).end();return;}
    response.writeHead(200,{
      'content-type':pathname.endsWith('.html')?
        'text/html; charset=utf-8':'text/javascript; charset=utf-8',
      'cache-control':'no-store'
    });
    response.end(body);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  let browser=null;
  try {
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('Missing browser test port');
    const origin='http://127.0.0.1:'+address.port;
    /** @type {unknown} */
    let baseline;
    for(const target of ['native','emitted']) {
      const {stdout}=await run(executable,[
        '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
        '--no-first-run','--virtual-time-budget=10000','--dump-dom',
        origin+'/'+target+'/index.html'
      ],{encoding:'utf8',timeout:45000,maxBuffer:4*1024*1024});
      const encoded=stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
      assert.ok(encoded,target+' Chromium failed: '+stdout.slice(0,1500));
      const value=JSON.parse(Buffer.from(encoded,'base64').toString('utf8'));
      if(target==='native')baseline=value;
      else assert.deepEqual(value,baseline,'Emitted Chromium module differs from native');
    }
    assert.deepEqual(baseline,{
      result:7,
      sourceText:'function observed() { return 29; }',
      labelText:'safe-literal'
    });
    browser=await puppeteer.launch({
      executablePath:executable,headless:true,
      args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run']
    });
    const browserPage=await browser.newPage();
    browserPage.setDefaultTimeout(60000);
    await browserPage.goto(origin+'/benchmark/index.html',{waitUntil:'load',timeout:60000});
    await browserPage.waitForSelector('#budget');
    const encodedBudget=await browserPage.$eval('#budget',element=>element.textContent??'');
    assert.ok(encodedBudget,'Chromium budget benchmark did not publish a report');
    const chromiumBudget=JSON.parse(Buffer.from(encodedBudget,'base64').toString('utf8'));
    assert.equal(chromiumBudget.length,2);
    const chromiumBudgetBounds=chromiumBudget.map(workload=>{
      const bound=pairedBudgetBound(workload.baselineSamplesMs,workload.obfuscatedSamplesMs,
        {threshold:2.5,confidence:0.95});
      const placebo=pairedBudgetBound(workload.placeboLeftSamplesMs,workload.placeboRightSamplesMs,
        {threshold:2.5,confidence:0.95});
      const timings=[...workload.baselineSamplesMs,...workload.obfuscatedSamplesMs].sort((a,b)=>a-b);
      const distinct=[...new Set(timings)];
      const minObservedStepMs=distinct.length>1?
        Math.min(...distinct.slice(1).map((value,index)=>value-distinct[index])):null;
      return {workload:workload.workload,...bound,placeboDecision:placebo.decision,
        placeboMedianOfPairedRatios:placebo.medianOfPairedRatios,
        placeboUpperMedianBound:placebo.upperMedianBound,
        placeboStrictBreachCount:workload.placeboStrictBreachCount,
        minObservedStepMs,distinctTimingCount:distinct.length};
    });
    assert.ok(chromiumBudgetBounds.every(workload=>workload.decision!=='exceeded'),
      'Chromium paired median slowdown confidence interval must not exceed 2.5x');
    process.stdout.write('SOURCE_OBSERVER_PLAN_CHROMIUM_BUDGET '+
      JSON.stringify({browser:runtimeVersion,workloads:chromiumBudget})+'\n');
    process.stdout.write('SOURCE_OBSERVER_PLAN_CHROMIUM_BUDGET_BOUND '+
      JSON.stringify({browser:runtimeVersion,workloads:chromiumBudgetBounds})+'\n');
    const report={
      browser:runtimeVersion,
      properties:emitted.metrics.properties,
      bindings:emitted.metrics.bindings,
      literals:emitted.metrics.literals,
      exactSource:true,
      chromiumBudget,
      chromiumBudgetBounds
    };
    process.stdout.write('SOURCE_OBSERVER_PLAN_CHROMIUM '+JSON.stringify(report)+'\n');
    return report;
  } finally {
    if(browser)await browser.close();
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve(undefined)));
  }
}

if(require.main===module)main().catch(error=>{
  process.stderr.write(String(error.stack||error)+'\n');
  process.exitCode=1;
});
module.exports={main,makeSource};
