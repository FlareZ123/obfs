'use strict';

const {test}=require('node:test');
const {run}=require('../sims/agent9-strict-stack-browser');

test('real Chromium exposes strict ESM frame coordinates after private-key renaming',{
  skip:process.platform==='linux'?false:'real Chromium fixture currently targets the Linux runner'
},async()=>{
  await run();
});
