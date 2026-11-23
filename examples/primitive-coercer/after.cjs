'use strict';

const caption='obfs';
const privateState={"_p60807327ca":37,"_p385d8f2593":5};

function privateCalculate(value) {
  const message=new RangeError(caption).message;
  const text=String(caption);
  return privateState._p60807327ca*value+privateState._p385d8f2593+message.length+text.length;
}

function calculate(value) {
  return privateCalculate(value);
}

module.exports={calculate};
