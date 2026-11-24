'use strict';
const {test}=require('node:test');
const {main}=require('./agent9-sco-host-held-callable-browser');
test('actual SCO handler delivery changes host-held callback source in Chromium',{
  timeout:120000,
  skip:process.platform==='win32'?'Chromium is provisioned on the Ubuntu runner only':false
},async()=>{await main();});
