'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const path=require('node:path');

/** @typedef {typeof import('../src')} ObfsApi */
/** @typedef {{server:import('node:http').Server,port:number}} RunningServer */

/** @param {string} directory @returns {ObfsApi} */
function loadApi(directory) {
  return /** @type {ObfsApi} */ (require(path.resolve(directory,'src')));
}

/** @param {ObfsApi} api @returns {Promise<RunningServer>} */
async function start(api) {
  const server=http.createServer(api.createScoHandler([],{
    remoteMethods:{
      /** @param {{text:string}} input */
      check:input=>input.text.length
    },
    authorizeRpc:()=>true,
    authorizeOperation:(_request,method,args)=>method==='check'&&
      args.length===1&&args[0]!==null&&typeof args[0]==='object'&&
      typeof /** @type {{text?:unknown}} */ (args[0]).text==='string'
  }));
  /** @type {Promise<void>} */
  const started=new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  await started;
  const address=server.address();
  if(!address||typeof address==='string')throw new Error('Expected TCP address');
  return {server,port:address.port};
}

/** @param {RunningServer} running @returns {Promise<void>} */
async function stop(running) {
  /** @type {Promise<void>} */
  const closed=new Promise((resolve,reject)=>
    running.server.close(error=>error?reject(error):resolve()));
  await closed;
}

/** @param {number} port @param {string} body @param {number} expected @returns {Promise<void>} */
async function request(port,body,expected) {
  const response=await fetch('http://127.0.0.1:'+port+'/obfs/rpc',{
    method:'POST',headers:{'content-type':'application/json'},body
  });
  assert.equal(response.status,200);
  const result=/** @type {{ok?:boolean,value?:unknown}} */ (await response.json());
  assert.equal(result.ok,true);
  assert.equal(result.value,expected);
}

/** @param {number[]} xs @returns {number} */
function median(xs) {
  const sorted=[...xs].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

/** @param {number} port @param {string} body @param {number} expected @param {number} n @returns {Promise<number>} */
async function timeHttp(port,body,expected,n) {
  const begin=process.hrtime.bigint();
  for(let i=0;i<n;i++)await request(port,body,expected);
  return Number(process.hrtime.bigint()-begin)/1e6;
}

/** @param {string} body @param {number} expected @param {number} n @param {boolean} isolated @returns {number} */
function timeParse(body,expected,n,isolated) {
  let checksum=0;
  const begin=process.hrtime.bigint();
  for(let i=0;i<n;i++) {
    const query=JSON.parse(body);
    checksum+=query.args[0].text.length;
    if(isolated) {
      const policy=JSON.parse(body);
      checksum+=policy.args[0].text.length;
    }
  }
  const millis=Number(process.hrtime.bigint()-begin)/1e6;
  assert.equal(checksum,n*expected*(isolated?2:1));
  return millis;
}

/** @returns {Promise<void>} */
async function main() {
  const [oldRoot,fixedRoot]=process.argv.slice(2);
  if(!oldRoot||!fixedRoot)throw new TypeError('Expected old and fixed source directories');
  const servers={old:await start(loadApi(oldRoot)),fixed:await start(loadApi(fixedRoot))};
  try{
    for(const length of [32,1024,16384,60000]) {
      const body=JSON.stringify({method:'check',args:[{text:'x'.repeat(length)}]});
      // Verify valid wire semantics independently of timing.
      await request(servers.old.port,body,length);
      await request(servers.fixed.port,body,length);
      for(let i=0;i<64;i++) {
        await request(servers.old.port,body,length);
        await request(servers.fixed.port,body,length);
      }
      /** @type {{old:number,fixed:number,ratio:number}[]} */
      const httpPairs=[];
      const httpIterations=length>16000?80:160;
      for(let i=0;i<7;i++) {
        /** @type {{old:number,fixed:number}} */
        const pair={old:0,fixed:0};
        const order=i%2===0?['old','fixed']:['fixed','old'];
        for(const label of order) {
          const key=/** @type {'old'|'fixed'} */ (label);
          pair[key]=await timeHttp(servers[key].port,body,length,httpIterations);
        }
        httpPairs.push({...pair,ratio:pair.fixed/pair.old});
      }
      const parseIterations=Math.max(128,Math.min(24000,Math.ceil(8000000/body.length)));
      for(let i=0;i<5;i++) {
        timeParse(body,length,parseIterations,false);
        timeParse(body,length,parseIterations,true);
      }
      /** @type {{one:number,two:number,ratio:number}[]} */
      const parserPairs=[];
      for(let i=0;i<9;i++) {
        const firstTwo=i%2===1;
        const first=timeParse(body,length,parseIterations,firstTwo);
        const second=timeParse(body,length,parseIterations,!firstTwo);
        const one=firstTwo?second:first;
        const two=firstTwo?first:second;
        parserPairs.push({one,two,ratio:two/one});
      }
      console.log(JSON.stringify({
        case:'SCO_POLICY_ARGS_PAIRED',payloadUtf8Bytes:Buffer.byteLength(body),
        expectedValue:length,httpIterations,parseIterations,
        httpPairs,parserPairs,
        httpMedianIncremental:median(httpPairs.map(p=>p.ratio)),
        httpStrictOver2_5:httpPairs.filter(p=>p.ratio>2.5).length,
        parserMedianIncremental:median(parserPairs.map(p=>p.ratio)),
        parserStrictOver2_5:parserPairs.filter(p=>p.ratio>2.5).length
      }));
    }
  }finally{
    await stop(servers.old);
    await stop(servers.fixed);
  }
}

void main().catch(error=>{console.error(error);process.exitCode=1;});
