'use strict';

const {test}=require('node:test');
const {run}=require('../sims/straightline-reader-profile');

test('private reader direct-call rewrite passes paired post-start CPU budget profile',{
  timeout:120000
},()=>{
  // The source-only normalizer and native/compiled output parity are tested
  // separately in function-declaration-reader-proof.test.js. This profile
  // calls the unchanged selected-hot-work evaluator after the source-private
  // reader yield has been restored; it asserts every sampled pair <=2.5x.
  run();
});
