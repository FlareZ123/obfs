'use strict';

/** @param {number} x Int32 @param {number} y Int32 */
function digest(x,y) {
  return ((((((x)^(((x)&(y))^-1579985416))^((y)^((~(~(x)|~(y)))^-1579985416)))) + 17) & 0x7fffffff);
}
module.exports=digest;
