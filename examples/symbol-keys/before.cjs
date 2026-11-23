'use strict';
const bag={pulse:7,mask:3};
function readPulse(){return bag.pulse;}
function writePulse(value){bag.pulse=value;}
function readMask(){return bag.mask;}
module.exports=function calc(x){
  const next=readPulse()+x;
  writePulse(next);
  return (readPulse()^readMask())|0;
};
