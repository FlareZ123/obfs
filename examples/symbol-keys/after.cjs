'use strict';
const _sk_1b0e297ac054=Symbol();const _sk_6031c6109d3d=Symbol();

const bag={[_sk_1b0e297ac054]:7,[_sk_6031c6109d3d]:3};
function privateCalc(x){bag[_sk_1b0e297ac054]+=x;return (bag[_sk_1b0e297ac054]^bag[_sk_6031c6109d3d])|0;}
function calc(x){return privateCalc(x);}
module.exports=calc;
