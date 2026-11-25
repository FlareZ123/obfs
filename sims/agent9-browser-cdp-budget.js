'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const puppeteer=require('puppeteer-core');
const {obfuscateFiles}=require('../src/core');
const {pairedBudgetBound}=require('./paired-budget-bound');

/** @typedef {{scriptMs:number,taskMs:number,wallMs:number,values:number[]}} TimedSample */

function makeSource(count) {
  return [
    "'use strict';",
    "const marker='task-duration-probe';",
    'const owner={secretValue:17,step:7};',
    'function hidden(iterations) {',
    '  owner.secretValue=17;',
    '  let sum=0;',
    '  for(let index=0;index<iterations;index++){',
    '    owner.secretValue=(owner.secretValue+owner.step)|0;',
    '    sum=(sum+owner.secretValue+marker.charCodeAt(index%marker.length))|0;',
    '  }',
    '  return sum|0;',
    '}',
    'const started=performance.now();',
    'const values=[hidden(100000),hidden(100000),hidden(100000),hidden('+count+')];',
    'globalThis.__wallMs=performance.now()-started;',
    'module.exports=values;'
  ].join('\n');
}

/**
 * @param {import('puppeteer-core').CDPSession} session
 * @returns {Promise<{scriptSeconds:number,taskSeconds:number}>}
 */
async function readMetrics(session) {
  const {metrics}=await session.send('Performance.getMetrics');
  const values=new Map(metrics.map(metric=>[metric.name,metric.value]));
  const scriptSeconds=values.get('ScriptDuration');
  const taskSeconds=values.get('TaskDuration');
  if(typeof scriptSeconds!=='number'||typeof taskSeconds!=='number')
    throw new Error('CDP ScriptDuration/TaskDuration metrics unavailable');
  return {scriptSeconds,taskSeconds};
}

/**
 * @param {import('puppeteer-core').CDPSession} session
 * @param {()=>Promise<number[]>} operation
 * @returns {Promise<TimedSample>}
 */
async function measureScript(session,operation) {
  const before=await readMetrics(session);
  const values=await operation();
  const after=await readMetrics(session);
  return {
    scriptMs:(after.scriptSeconds-before.scriptSeconds)*1000,
    taskMs:(after.taskSeconds-before.taskSeconds)*1000,
    wallMs:0,
    values
  };
}

/**
 * Prototype measurement of current-compiler COO initialization plus repeated
 * runtime use in one strict script evaluation. ScriptDuration and TaskDuration
 * are renderer-main-thread metrics; performance.now is diagnostic only.
 *
 * @param {{count?:number,trials?:number}} [options]
 * @returns {Promise<{
 *   chrome:string,node:string,count:number,trials:number,
 *   compilerMetrics:{literals:number,objects:number,properties:number,bindings:number},
 *   rows:Array<{trial:number,order:string[],native:TimedSample,protected:TimedSample}>,
 *   scriptBudget:ReturnType<typeof pairedBudgetBound>,
 *   taskBudget:ReturnType<typeof pairedBudgetBound>,
 *   clock:string,scope:string
 * }>}
 */
async function runChromium(options={}) {
  const count=options.count??1000000;
  const trials=options.trials??11;
  assert.ok(Number.isSafeInteger(count)&&count>0);
  assert.ok(Number.isSafeInteger(trials)&&trials>=5);
  const nativeSource=makeSource(count);
  const transformed=obfuscateFiles([{
    path:'protected.js',sourceType:'commonjs',code:nativeSource
  }],{
    mode:'coo',closedWorld:true,seed:'agent9-cdp-task-duration',
    properties:true,identifiers:true,strings:true
  }).files[0];
  assert.ok(transformed.metrics.properties>0,'Expected property rewrite');
  assert.ok(transformed.metrics.bindings>0,'Expected identifier rewrite');
  assert.ok(transformed.metrics.literals>0,'Expected string initialization transform');

  const pageHtml='<!doctype html><html><body><script>window.module={exports:null};</script></body></html>';
  const files=new Map([
    ['/',{type:'text/html; charset=utf-8',body:pageHtml}],
    ['/native.js',{type:'text/javascript; charset=utf-8',body:nativeSource}],
    ['/protected.js',{type:'text/javascript; charset=utf-8',body:String(transformed.code)}]
  ]);
  const server=http.createServer((request,response)=>{
    const pathname=new URL(request.url??'/', 'http://127.0.0.1').pathname;
    const file=files.get(pathname);
    if(!file){response.writeHead(404);response.end();return;}
    response.writeHead(200,{'content-type':file.type});
    response.end(file.body);
  });
  const browser=await puppeteer.launch({
    executablePath:process.env.CHROMIUM_BIN??'/usr/bin/google-chrome',
    headless:true,protocolTimeout:180000,
    args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run']
  });
  /** @type {Array<{trial:number,order:string[],native:TimedSample,protected:TimedSample}>} */
  const rows=[];
  try {
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',resolve);
    });
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('Missing CDP fixture port');
    const base='http://127.0.0.1:'+address.port;
    const chrome=await browser.version();
    for(let trial=0;trial<trials;trial++) {
      /** @type {('native'|'protected')[]} */
      const order=trial%2===0?['native','protected']:['protected','native'];
      /** @type {{native?:TimedSample,protected?:TimedSample}} */
      const samples={};
      for(const lane of order) {
        const page=await browser.newPage();
        const session=await page.createCDPSession();
        try {
          await page.goto(base+'/');
          await session.send('Performance.enable');
          const scriptPath='/'+lane+'.js?trial='+trial;
          const sample=await measureScript(session,async()=>{
            await page.addScriptTag({url:base+scriptPath});
            return page.evaluate(()=>{
              const globals=/** @type {Record<string,any>} */ (globalThis);
              return globals.module.exports;
            });
          });
          sample.wallMs=await page.evaluate(()=>{
            const globals=/** @type {Record<string,any>} */ (globalThis);
            return globals.__wallMs;
          });
          assert.ok(sample.scriptMs>0&&sample.taskMs>0,lane+' renderer deltas must be positive');
          samples[lane]=sample;
        } finally {
          await session.detach();
          await page.close();
        }
      }
      const native=samples.native;
      const protectedSample=samples.protected;
      assert.ok(native&&protectedSample,'Both lanes must be measured');
      assert.deepEqual(native.values,protectedSample.values,'native/protected result parity');
      rows.push({trial,order,native,protected:protectedSample});
    }
    const nativeScript=rows.map(row=>row.native.scriptMs);
    const protectedScript=rows.map(row=>row.protected.scriptMs);
    const nativeTask=rows.map(row=>row.native.taskMs);
    const protectedTask=rows.map(row=>row.protected.taskMs);
    return {
      chrome,node:process.version,count,trials,compilerMetrics:transformed.metrics,rows,
      scriptBudget:pairedBudgetBound(nativeScript,protectedScript,{threshold:2.5,confidence:0.95}),
      taskBudget:pairedBudgetBound(nativeTask,protectedTask,{threshold:2.5,confidence:0.95}),
      clock:'CDP Performance.getMetrics ScriptDuration and TaskDuration (renderer main thread); page performance.now is diagnostic only',
      scope:'Single COO strict CommonJS-style script. Each sample includes decoder initialization and three 100k calls plus one hot call. Not process-wide CPU, worker CPU, SCO/SNO, cross-browser, or full-session acceptance.'
    };
  } finally {
    await browser.close();
    await new Promise(resolve=>server.close(error=>error?reject(error):resolve()));
  }
}

if(require.main===module)runChromium().then(result=>
  process.stdout.write(JSON.stringify(result,null,2)+'\n')).catch(error=>{
  console.error(error);
  process.exitCode=1;
});
module.exports={runChromium};
