'use strict';

const {test}=require('node:test');
const {parse}=require('../src/ast');
const {collectBindings,proveLocalObject}=require('../src/properties');

const variants={
  oneReader:'const bag={pulse:7,mask:3};function readPulse(){return bag.pulse;}module.exports=function calc(){return readPulse();};',
  oneWriter:'const bag={pulse:7,mask:3};function writePulse(value){bag.pulse=value;}module.exports=function calc(x){writePulse(x);return 1;};',
  oneScore:'const bag={pulse:7,mask:3};function privateScore(){return bag.pulse+bag.mask;}module.exports=function calc(){return privateScore();};',
  readWrite:'const bag={pulse:7,mask:3};function readPulse(){return bag.pulse;}function writePulse(value){bag.pulse=value;}function readMask(){return bag.mask;}module.exports=function calc(x){const next=readPulse()+x;writePulse(next);return (readPulse()^readMask())|0;};'
};

test('diagnose private Symbol helper proof',()=>{
  for(const [name,source] of Object.entries(variants)) {
    const ast=parse(source,'commonjs');
    const proof=proveLocalObject(ast,'bag',collectBindings(ast));
    process.stdout.write('SYMBOL_VARIANT '+name+' '+JSON.stringify(proof?{
      members:proof.members.length,patterns:proof.patterns.length,inChecks:proof.inChecks.length
    }:null)+'\n');
  }
});
