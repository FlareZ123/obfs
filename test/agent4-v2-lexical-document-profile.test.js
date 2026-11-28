'use strict';
const {test}=require('node:test');
const {main}=require('../sims/agent4-v2-lexical-document-profile');

test('paired native/emitted CPU and whole-process budget, three architectures',{
  timeout:120000
},()=>{
  // This is a *measurement*, not universal proof of the project's 2.5x cap.
  // The script checks exact hot-work result equality for every original and
  // obfuscated child process, then prints reproducible paired median ratios.
  process.env.OBFS_AGENT4_PROFILE_ITERATIONS='3000000';
  process.env.OBFS_AGENT4_PROFILE_ROUNDS='4';
  main();
});
