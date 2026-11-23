'use strict';
const bag={pulse:7,mask:3};
function privateStep(){bag.pulse+=2;return (bag.pulse^bag.mask)|0;}
module.exports=function calc(){return privateStep();};
