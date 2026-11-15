'use strict';

function mix(x) {
  return _egvm_c745bb0ff1803adf(x);
}

module.exports = mix;

var _egvm_c745bb0ff1803adfCache;function _egvm_c745bb0ff1803adf(input){const tape=_egvm_c745bb0ff1803adfCache||(_egvm_c745bb0ff1803adfCache=[31,244,246,247,28,242,246,245,29,243,244,242,31,241,246,240,25,255,241,254,24,252,243,255,17,252]);const registers=[input,(22^17),null,(20^17),null,null,(18^17),null,(238^17),null,null];let pc=0;for(;;){const opcode=((tape[pc++]^246)-232)&255;if(opcode===255)return registers[tape[pc++]^246];const dst=tape[pc++]^246,left=tape[pc++]^246,right=tape[pc++]^246;switch(opcode){case 1:registers[dst]=registers[left]+registers[right];break;case 2:registers[dst]=registers[left]-registers[right];break;case 3:registers[dst]=registers[left]*registers[right];break;case 4:registers[dst]=registers[left]/registers[right];break;case 5:registers[dst]=registers[left]%registers[right];break;case 6:registers[dst]=registers[left]^registers[right];break;case 7:registers[dst]=registers[left]&registers[right];break;case 8:registers[dst]=registers[left]|registers[right];break;case 9:registers[dst]=registers[left]<<registers[right];break;case 10:registers[dst]=registers[left]>>registers[right];break;case 11:registers[dst]=registers[left]>>>registers[right];break;default:throw Error("Invalid expression VM instruction");}}}
