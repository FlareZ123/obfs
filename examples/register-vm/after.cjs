'use strict';
function mix(x){return (_rvm_4e0b19e34e742226(x));}
module.exports=mix;

var _rvm_4e0b19e34e742226Cache;function _rvm_4e0b19e34e742226(input){const bytes=_rvm_4e0b19e34e742226Cache||(_rvm_4e0b19e34e742226Cache=[8,67,10,71,11,30,9,65,6]);let value=input,pc=0;for(;;){switch((bytes[pc++]-7)&255){case 1:value+=(bytes[pc++]^68);break;case 2:value-=(bytes[pc++]^68);break;case 3:value*=(bytes[pc++]^68);break;case 4:value^=(bytes[pc++]^68);break;case 5:value&=(bytes[pc++]^68);break;case 6:value|=(bytes[pc++]^68);break;case 7:value<<=(bytes[pc++]^68);break;case 8:value>>=(bytes[pc++]^68);break;case 9:value>>>=(bytes[pc++]^68);break;case 255:return value;default:throw new Error("Invalid VM instruction");}}}
