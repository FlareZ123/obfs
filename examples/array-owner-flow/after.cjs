'use strict';

// A private owner shared through an immutable one-slot local container.
// Both indices are literal zero and the array itself never escapes.
const owner={"_pb614e9228d":11,"_p2d2fde828f":7};
const holder=[owner];
const first=holder[0];
const second=holder[0];
function read(value){return value._pb614e9228d+value._p2d2fde828f;}
module.exports=function score(input){
  return read(first)+second._pb614e9228d*input+first._p2d2fde828f;
};
