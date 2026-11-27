'use strict';

const {test}=require('node:test');
const {main}=require('./agent1-native-callback-browser');

test('native intrinsic callback source observation remains visible in Chromium',{
  timeout:120000,
  skip:process.platform==='win32'?'Chromium is provisioned on the Ubuntu runner only':false
},async()=>{
  await main();
});
