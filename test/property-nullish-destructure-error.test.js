'use strict';

const {test}=require('node:test');
const {run}=require('../sims/property-nullish-destructure-error-attack');

test('caught nullish object-pattern TypeError expressions retain source spelling in COO, SNO and SCO',()=>{
  run(true);
});
