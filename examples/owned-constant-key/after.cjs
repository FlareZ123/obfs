'use strict';

const key='secretField';
const internal={"_p036be60b25":11,"_p1147e89b98":3};
globalThis.secretField=9;

function privateCalculate(x) {
  return ((internal["_p036be60b25"]+globalThis[key])*x)^internal._p1147e89b98;
}

function calculate(x) {
  return privateCalculate(x);
}

module.exports={calculate};
