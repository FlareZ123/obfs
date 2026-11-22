'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const http=require('node:http');
const path=require('node:path');
const puppeteer=require('puppeteer-core');
const {atomicWrite}=require('../src/atomic');
const {pairedBudgetBound}=require('./paired-budget-bound');
const {createMatchedBlindAffineChallenge}=require('./llm-matched-affine-challenge');
const {attackPublishedSource}=require('./llm-matched-affine-static-attack');

/** @typedef {'native'|'generated'|'minified'|'rebuilt'} Variant */

/**
 * Exercise four executable ESM artifacts in genuine Chromium. The browser
 * receives only served code, while the independent source-only attacker
 * commits its offsets before the host discloses original source. Measurement
 * and result marshaling stay outside submitted transformed JavaScript.
 *
 * @returns {Promise<object>}
 */
async function run(){
  const trial=createMatchedBlindAffineChallenge('coo');
  const attacks=trial.questions.map(question=>attackPublishedSource(question.source));
  assert.deepEqual(attacks[0].offsets,attacks[1].offsets);
  assert.ok(trial.verify(attacks.map(attack=>attack.offsets))
    .every(verdict=>verdict.passed));
  const revealed=trial.reveal();
  const codes=/** @type {Record<Variant,string>} */ ({
    native:revealed.originalSource,
    generated:trial.questions[revealed.arms.indexOf('generated')].source,
    minified:trial.questions[revealed.arms.indexOf('esbuild-minified')].source,
    rebuilt:attacks[revealed.arms.indexOf('generated')].reconstructedSource
  });
  const serverFiles=new Map([
    ['/index.html','<!doctype html><meta charset="utf-8"><title>Affine public ESM comparison</title>']
  ]);
  for(const [name,source] of Object.entries(codes))
    serverFiles.set('/'+name+'.mjs',source);
  /** @type {Record<string,number>} */
  const requests={};
  const server=http.createServer((request,response)=>{
    const pathname=(request.url??'').split('?')[0];
    const source=serverFiles.get(pathname);
    if(request.method!=='GET'||source===undefined){
      response.writeHead(404).end();return;
    }
    requests[pathname]=(requests[pathname]??0)+1;
    response.writeHead(200,{
      'content-type':pathname.endsWith('.html')?
        'text/html; charset=utf-8':'text/javascript; charset=utf-8',
      'cache-control':'no-store'
    });
    response.end(source);
  });
  /** @type {import('puppeteer-core').Browser|undefined} */
  let browser;
  try{
    /** @type {Promise<void>} */
    const listening=new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',()=>resolve());
    });
    await listening;
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    browser=await puppeteer.launch({
      executablePath:process.env.CHROMIUM_BIN??'/usr/bin/google-chrome',
      headless:true,
      args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run']
    });
    const page=await browser.newPage();
    await page.goto('http://127.0.0.1:'+address.port+'/index.html',{
      waitUntil:'domcontentloaded',timeout:45000
    });
    const observed=await page.evaluate(async()=>{
      const labels=['native','generated','minified','rebuilt'];
      const names=['round1','round2','round3'];
      const files=await Promise.all(labels.map(async name=>
        [name,await import('/'+name+'.mjs')]
      ));
      const modules=/** @type {Record<string,Record<string,(input:unknown)=>number>>} */ (
        Object.fromEntries(files)
      );
      const inputs=/** @type {unknown[]} */ ([
        undefined,null,true,false,-0,0,1,-1,NaN,Infinity,-Infinity,
        2147483647,-2147483648,4294967295,-4294967297,'47','',0n,3n,Symbol('x')
      ]);
      let seed=0x65a3b7cf;
      for(let i=0;i<8192;i++){
        seed=(Math.imul(seed,1664525)+1013904223)|0;
        inputs.push(seed);
      }
      /**
       * @param {(input:unknown)=>number} fn
       * @param {unknown} input
       * @returns {{ok:boolean,value?:number,name?:string}}
       */
      function observe(fn,input){
        try{return {ok:true,value:fn(input)};}
        catch(error){
          if(!(error instanceof Error))throw error;
          return {ok:false,name:error.name};
        }
      }
      let checked=0;
      for(const name of names){
        for(const input of inputs){
          const expected=observe(modules.native[name],input);
          for(const variant of ['generated','minified','rebuilt']){
            const result=observe(modules[variant][name],input);
            if(result.ok!==expected.ok||result.name!==expected.name||
               (result.ok&&!Object.is(result.value,expected.value)))
              throw new Error('Different browser output: '+variant+'/'+name);
          }
          checked++;
        }
      }
      const reflection=Object.fromEntries(
        ['generated','minified','rebuilt'].map(variant=>[
          variant,names.map(name=>({
            nameEqual:modules[variant][name].name===modules.native[name].name,
            lengthEqual:modules[variant][name].length===modules.native[name].length,
            sourceEqual:Function.prototype.toString.call(modules[variant][name])===
              Function.prototype.toString.call(modules.native[name])
          }))
        ])
      );
      if(reflection.generated.some(row=>row.sourceEqual))
        throw new Error('Expected modified source to remain externally observable');
      const callsPerExport=2000000,rounds=9;
      /** @param {Record<string,(input:unknown)=>number>} functions @returns {number} */
      function work(functions){
        let checksum=0;
        for(const name of names){
          const fn=functions[name];
          let input=0x43af78cd;
          for(let i=0;i<callsPerExport;i++){
            input=(Math.imul(input,1664525)+1013904223)|0;
            checksum=(Math.imul(checksum,33)^fn(input))|0;
          }
        }
        return checksum;
      }
      const checksum=work(modules.native);
      for(const variant of labels){
        if(work(modules[variant])!==checksum)
          throw new Error('Different browser long-run output: '+variant);
      }
      for(let warm=0;warm<2;warm++){
        for(const variant of labels){
          if(work(modules[variant])!==checksum)
            throw new Error('Different browser warmup output: '+variant);
        }
      }
      /** @type {Record<string,number[]>} */
      const sampleMs={native:[],generated:[],minified:[],rebuilt:[]};
      const orders=[
        ['native','generated','minified','rebuilt'],
        ['rebuilt','minified','generated','native'],
        ['minified','native','rebuilt','generated'],
        ['generated','rebuilt','native','minified']
      ];
      for(let trial=0;trial<rounds;trial++){
        for(const variant of orders[trial%orders.length]){
          const start=performance.now();
          const value=work(modules[variant]);
          const ms=performance.now()-start;
          if(value!==checksum||!Number.isFinite(ms)||ms<=0)
            throw new Error('Invalid browser CPU sample: '+variant);
          sampleMs[variant].push(ms);
        }
      }
      return {checked,inputs:inputs.length,reflection,
        callsPerExport,rounds,checksum,sampleMs};
    });
    assert.equal(observed.checked,3*(8192+20));
    assert.equal(observed.callsPerExport,2000000);
    assert.equal(observed.rounds,9);
    for(const route of serverFiles.keys())assert.equal(requests[route],1,route);
    const result={
      platform:process.platform,node:process.version,browserVersion:await browser.version(),
      sourceCommitment:revealed.commitment,
      sourceBytes:Object.fromEntries(Object.entries(codes).map(([name,source])=>
        [name,Buffer.byteLength(source)])),
      zeroRuntimeOracleQueries:0,
      checked:observed.checked,inputs:observed.inputs,
      rounds:observed.rounds,callsPerExport:observed.callsPerExport,
      reflection:observed.reflection,sampleMs:observed.sampleMs,
      generatedVsNative:pairedBudgetBound(
        observed.sampleMs.native,observed.sampleMs.generated),
      rebuiltVsNative:pairedBudgetBound(
        observed.sampleMs.native,observed.sampleMs.rebuilt)
    };
    const dir=process.env.OBFS_AFFINE_BROWSER_RECEIPT_DIR;
    if(dir){
      await fs.mkdir(dir,{recursive:true});
      await atomicWrite(path.join(dir,'chromium.json'),JSON.stringify({
        result,codes,revealed,questions:trial.questions
      },null,2)+'\n');
    }
    console.log('MATCHED_AFFINE_CHROMIUM '+JSON.stringify(result));
    return result;
  }finally{
    if(browser)await browser.close();
    /** @type {Promise<void>} */
    const closed=new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve())
    );
    await closed;
  }
}

if(require.main===module)run().catch(error=>{
  console.error(error);process.exitCode=1;
});
module.exports={run};
