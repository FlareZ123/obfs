'use strict';

const {test}=require('node:test');
const {main}=require('./agent1-host-held-callback-browser');

test('host-held callbacks expose source to a patched browser scheduler without invocation',{
  timeout:120000,
  skip:process.platform==='win32'?'Chromium is provisioned on the Ubuntu runner only':false
},async()=>{
  await main();
});
