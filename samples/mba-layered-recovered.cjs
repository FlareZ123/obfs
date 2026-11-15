'use strict';

/** @param {number} x Int32 @param {number} y Int32 */
function digest(x,y) {
  return (((((x^y))) + 17) & 0x7fffffff);
}
module.exports=digest;
