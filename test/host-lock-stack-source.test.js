'use strict';

const {test}=require('node:test');
const {run}=require('../sims/host-lock-stack-source-attack');

test('single-file host lock declines observable Error stack coordinates',()=>{
  run(true);
});
