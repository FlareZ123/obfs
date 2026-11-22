'use strict';

const key='secretField';
const internal={secretField:11,mask:3};
globalThis.secretField=9;

function calculate(x) {
  return ((internal[key]+globalThis[key])*x)^internal.mask;
}

function exportedCalculate(x){return calculate(x);}
module.exports={calculate:exportedCalculate};
