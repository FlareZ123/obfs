'use strict';

const {test}=require('node:test');
const {run}=require('../sims/property-nullish-destructure-error-attack');
const {run:runIdentifier}=require('../sims/identifier-nullish-nested-default-attack');

test('caught nullish object-pattern TypeError expressions retain source spelling in COO, SNO and SCO',()=>{
  run(true);
});

test('nested default destructuring source spelling also survives local identifier renaming',()=>{
  runIdentifier(true);
});
