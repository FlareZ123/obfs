'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {main}=require('./sco-host-ipv6-browser');

test('repeat native versus selected SCO IPv6 origin host-lock browser delivery',{
  skip:process.platform!=='linux'||
    process.env.OBFS_FOCUSED_TEST!=='test/sco-ipv6-delivery-repeat.test.js',
  timeout:240000
},async()=>{
  const priorBin=process.env.CHROMIUM_BIN;
  process.env.CHROMIUM_BIN='google-chrome';
  /** @type {{trial:number,result:'pass'|'error',message?:string}[]} */
  const trials=[];
  try{
    for(let i=0;i<3;i++){
      try{
        await main();
        trials.push({trial:i+1,result:'pass'});
      }catch(error){
        trials.push({trial:i+1,result:'error',
          message:String(error&&typeof error==='object'&&'message' in error?
            error.message:error)});
      }
    }
  }finally{
    if(priorBin===undefined)delete process.env.CHROMIUM_BIN;
    else process.env.CHROMIUM_BIN=priorBin;
  }
  console.log('SCO_IPV6_REPEAT '+JSON.stringify(trials));
  assert.equal(trials.filter(t=>t.result==='error').length,0,
    'A native-vs-generated IPv6 mismatch is a real red admission/delivery finding');
});
