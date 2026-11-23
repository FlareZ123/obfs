'use strict';

const key='secretField';
const internal={"_pc60450fdb3":11,"_pa7327e0356":3};
globalThis.secretField=9;

function privateCalculate(x) {
  return ((internal["_pc60450fdb3"]+globalThis[key])*x)^internal._pa7327e0356;
}

function calculate(x) {
  return privateCalculate(x);
}

module.exports={calculate};
