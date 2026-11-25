'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const puppeteer=require('puppeteer-core');
const {obfuscateFiles}=require('../src/core');
const {pairedBudgetBound}=require('./paired-budget-bound');

const nativeSource=[
  "const marker='task-duration-probe';",
  'export function run(count) {',
  '  const state={secretValue:17,step:7};',
  '  const alias=state;',
  '  let sum=0;',
  '  for(let index=0;index<count;index++){',
  '    alias.secretValue=(alias.secretValue+alias.step)|0;',
  '    sum=(sum+alias.secretValue+marker.charCodeAt(index%marker.length))|0;',
  '  }',
  '  return sum|0;',
  '}'
].join('\n');

/**
 * @typedef {{scriptMs:number,taskMs:number,wallMs:number,result:number}} TimedCall
 */

/**
 * @param {import('puppeteer-core').CDPSession} session
 * @returns {Promise<{scriptSeconds:number,taskSeconds:number}>}
 */
async function readMetrics(session) {
  const {metrics}=await session.send('Performance.getMetrics');
  const values=new Map(metrics.map(metric=>[metric.name,metric.value]));
  const scriptSeconds=values.get('ScriptDuration');
  const taskSeconds=values.get('TaskDuration');
  assert.equal(typeof scriptSeconds,'number','CDP ScriptDuration metric unavailable');
  assert.equal(typeof taskSeconds,'number','CDP TaskDuration metric unavailable');
  return {scriptSeconds,taskSeconds};
}

/**
 * Measure a page operation using renderer-side CDP deltas. performance.now
 * is retained only as an elapsed-time diagnostic, not as the CPU measure.
 * @template T
 * @param {import('puppeteer-core').CDPSession} session
 * @param {()=>Promise<T>} operation
 * @returns {Promise<{scriptMs:number,taskMs:number,result:T}>}
 */
async function measure(session,operation) {
  const before=await readMetrics(session);
  const result=await operation();
  const after=await readMetrics(session);
  return {
    scriptMs:(after.scriptSeconds-before.scriptSeconds)*1000,
    taskMs:(after.taskSeconds-before.taskSeconds)*1000,
    result
  };
}

/**
 * Prototype measurement of current-compiler COO initialization and runtime
 * using Chromium renderer ScriptDuration/TaskDuration, with wall time shown
 * only for comparison. This is one workload, not comprehensive acceptance.
 *
 * @param {{count?:number,trials?:number}} [options]
 * @returns {Promise<{
 *   chrome:string,node:string,count:number,trials:number,workload:string,
 *   compilerMetrics:{literals:number,objects:number,properties:number,bindings:number},
 *   rows:Array<{trial:number,order:string[],native:{init:TimedCall,cold:TimedCall,warm:TimedCall,hot:TimedCall,totalScriptMs:number,totalTaskMs:number},protected:{init:TimedCall,cold:TimedCall,warm:TimedCall,hot:TimedCall,totalScriptMs:number,totalTaskMs:number}}>,
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

  const transformed=obfuscateFiles([{
    path:'protected.mjs',sourceType:'module',code:nativeSource
  }],{
    mode:'coo',closedWorld:true,seed:'agent9-cdp-task-duration',
    properties:true,identifiers:true,strings:true
  }).files[0];
  assert.ok(transformed.metrics.properties>0,'Expected property rewrite');
  assert.ok(transformed.metrics.bindings>0,'Expected identifier rewrite');
  assert.ok(transformed.metrics.literals>0,'Expected string initialization transform');

  const pageHtml='<!doctype html><html><body>CDP task-duration fixture</body></html>';
  const files=new Map([
    ['/',{type:'text/html; charset=utf-8',body:pageHtml}],
    ['/native.mjs',{type:'text/javascript; charset=utf-8',body:nativeSource}],
    ['/protected.mjs',{type:'text/javascript; charset=utf-8',body:String(transformed.code)}]
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
  /** @type {Array<{trial:number,order:string[],native:{init:TimedCall,cold:TimedCall,warm:TimedCall,hot:TimedCall,totalScriptMs:number,totalTaskMs:number},protected:{init:TimedCall,cold:TimedCall,warm:TimedCall,hot:TimedCall,totalScriptMs:number,totalTaskMs:number}}>} */
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
    const page=await browser.newPage();
    const session=await page.createCDPSession();
    try {
      await page.goto(base+'/');
      await session.send('Performance.enable');
      for(let trial=0;trial<trials;trial++) {
        /** @type {('native'|'protected')[]} */
        const order=trial%2===0?['native','protected']:['protected','native'];
        /** @type {Record<'native'|'protected',{init:TimedCall,cold:TimedCall,warm:TimedCall,hot:TimedCall,totalScriptMs:number,totalTaskMs:number}>} */
        const lanes={};
        for(const lane of order) {
          const modulePath='/'+lane+'.mjs?trial='+trial;
          const initMeasured=await measure(session,async()=>{
            const result=await page.evaluate(async path=>{
              const module=await import(path);
              globalThis.__activeBudgetModule=module;
              return Object.keys(module);
            },modulePath);
            return {scriptMs:0,taskMs:0,wallMs:0,result:result.length};
          });
          const init=/** @type {TimedCall} */ ({
            scriptMs:initMeasured.scriptMs,taskMs:initMeasured.taskMs,
            wallMs:0,result:initMeasured.result.result
          });
          const coldMeasured=await measure(session,async()=>{
            return page.evaluate(count=>{
              const start=performance.now();
              const result=globalThis.__activeBudgetModule.run(count);
              return {result,wallMs:performance.now()-start};
            },count);
          });
          const cold=/** @type {TimedCall} */ ({
            scriptMs:coldMeasured.scriptMs,taskMs:coldMeasured.taskMs,
            wallMs:coldMeasured.result.wallMs,result:coldMeasured.result.result
          });
          const warmMeasured=await measure(session,async()=>{
            return page.evaluate(()=>{
              const start=performance.now();
              let result=0;
              for(let index=0;index<2;index++)
                result=globalThis.__activeBudgetModule.run(100000);
              return {result,wallMs:performance.now()-start};
            });
          });
          const warm=/** @type {TimedCall} */ ({
            scriptMs:warmMeasured.scriptMs,taskMs:warmMeasured.taskMs,
            wallMs:warmMeasured.result.wallMs,result:warmMeasured.result.result
          });
          const hotMeasured=await measure(session,async()=>{
            return page.evaluate(count=>{
              const start=performance.now();
              const result=globalThis.__activeBudgetModule.run(count);
              return {result,wallMs:performance.now()-start};
            },count);
          });
          const hot=/** @type {TimedCall} */ ({
            scriptMs:hotMeasured.scriptMs,taskMs:hotMeasured.taskMs,
            wallMs:hotMeasured.result.wallMs,result:hotMeasured.result.result
          });
          assert.ok(init.scriptMs>=0&&init.taskMs>=0,lane+' initialization deltas');
          assert.ok(cold.scriptMs>0&&cold.taskMs>0,lane+' cold-call deltas');
          assert.ok(warm.scriptMs>0&&warm.taskMs>0,lane+' warm-call deltas');
          assert.ok(hot.scriptMs>0&&hot.taskMs>0,lane+' hot-call deltas');
          lanes[lane]={
            init,cold,warm,hot,
            totalScriptMs:init.scriptMs+cold.scriptMs+warm.scriptMs+hot.scriptMs,
            totalTaskMs:init.taskMs+cold.taskMs+warm.taskMs+hot.taskMs
          };
        }
        assert.equal(lanes.native.cold.result,lanes.protected.cold.result,'cold result parity');
        assert.equal(lanes.native.warm.result,lanes.protected.warm.result,'warm result parity');
        assert.equal(lanes.native.hot.result,lanes.protected.hot.result,'hot result parity');
        rows.push({trial,order,native:lanes.native,protected:lanes.protected});
      }
    } finally {
      await session.detach();
      await page.close();
    }
    const nativeScript=rows.map(row=>row.native.totalScriptMs);
    const protectedScript=rows.map(row=>row.protected.totalScriptMs);
    const nativeTask=rows.map(row=>row.native.totalTaskMs);
    const protectedTask=rows.map(row=>row.protected.totalTaskMs);
    return {
      chrome,node:process.version,count,trials,workload:'one local-object alias loop with top-level string decode',
      compilerMetrics:transformed.metrics,rows,
      scriptBudget:pairedBudgetBound(nativeScript,protectedScript,{threshold:2.5,confidence:0.95}),
      taskBudget:pairedBudgetBound(nativeTask,protectedTask,{threshold:2.5,confidence:0.95}),
      clock:'CDP Performance.getMetrics ScriptDuration and TaskDuration (renderer main thread); page performance.now is diagnostic only',
      scope:'Single COO ESM workload. Measures module evaluation, first call, two 100k warm calls, and one hot call. Not process-wide CPU, worker CPU, SCO/SNO, cross-browser, or full-session acceptance.'
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
