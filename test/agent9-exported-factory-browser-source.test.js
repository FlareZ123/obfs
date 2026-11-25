'use strict';

const {test}=require('node:test');
const {main}=require('./agent9-exported-factory-browser-source');

test('Chromium host extracts transformed callbacks returned by browser-global factories',{
  timeout:120000,
  skip:process.platform==='win32'?'Chromium is provisioned on the Ubuntu runner only':false
},async()=>{
  await main();
});
