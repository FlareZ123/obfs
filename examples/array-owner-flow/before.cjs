'use strict';

// A private owner shared through an immutable one-slot local container.
// Both indices are literal zero and the array itself never escapes.
const owner={secretCount:11,privateDelta:7};
const holder=[owner];
const first=holder[0];
const second=holder[0];
function read(value){return value.secretCount+value.privateDelta;}
module.exports=function score(input){
  return read(first)+second.secretCount*input+first.privateDelta;
};
