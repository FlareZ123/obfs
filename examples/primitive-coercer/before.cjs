'use strict';

const caption='obfs';
const privateState={secretField:37,offset:5};

function calculate(value) {
  const message=new RangeError(caption).message;
  const text=String(caption);
  return privateState.secretField*value+privateState.offset+message.length+text.length;
}

module.exports={calculate};
