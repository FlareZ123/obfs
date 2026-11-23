'use strict';
const bag={pulse:7,mask:3};
function calc(x){bag.pulse+=x;return (bag.pulse^bag.mask)|0;}
module.exports=[calc(2),calc(4),calc(-3)];
