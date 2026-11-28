'use strict';
const {test}=require('node:test');
const {main}=require('./agent4-v2-inert-lexical-document-browser');

test('real strict-CSP Chromium local lexical Document source + inherited setter parity',{
  skip:process.platform!=='linux'?'Chromium differential runs on Ubuntu':false
},async()=>{
  await main();
});
