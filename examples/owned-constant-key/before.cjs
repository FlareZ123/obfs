'use strict';

const key='secretField';
const internal={secretField:11,mask:3};
globalThis.secretField=9;

function calculate(x) {
  return ((internal[key]+globalThis[key])*x)^internal.mask;
}

module.exports={calculate};
