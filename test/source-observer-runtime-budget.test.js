'use strict';

const test=require('node:test');
const {main}=require('../sims/source-observer-runtime-budget');

test('COO source-observer startup remains within the strict 2.5x budget',async()=>{
  await main();
});
