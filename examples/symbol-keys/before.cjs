'use strict';
const bag={pulse:7,mask:3};
function privateCalc(x){bag.pulse+=x;return (bag.pulse^bag.mask)|0;}
function calc(x){return privateCalc(x);}
module.exports=calc;
