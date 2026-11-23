'use strict';

const caption='obfs';
const privateState={"_p2f190c1cda":37,"_p5a36c03e72":5};

function privateCalculate(value) {
  const message=new RangeError(caption).message;
  const text=String(caption);
  return privateState._p2f190c1cda*value+privateState._p5a36c03e72+message.length+text.length;
}

function calculate(value) {
  return privateCalculate(value);
}

module.exports={calculate};
