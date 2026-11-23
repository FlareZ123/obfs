'use strict';

const key='secretField';
const internal={secretField:11,mask:3};
globalThis.secretField=9;

function privateCalculate(x) {
  return ((internal[key]+globalThis[key])*x)^internal.mask;
}

function calculate(x) {
  return privateCalculate(x);
}

module.exports={calculate};
