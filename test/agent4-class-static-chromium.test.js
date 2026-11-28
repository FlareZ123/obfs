'use strict';
const {test}=require('node:test');
const {main}=require('./agent4-class-static-chromium');

test('real Chromium COO ESM class-static source observation and pure-field yield',
  {skip:process.platform!=='linux'?
    'Chromium source-observer repro is scoped to the Ubuntu-focused CI runner':false},
  async()=>{await main();});
