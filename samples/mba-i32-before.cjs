'use strict';

/** @param {number} x Primitive Int32 @param {number} y Primitive Int32 @returns {number} */
function digest(x, y) {
  return ((((x ^ y) + 17) ^ ((x & 1023) - y)) | 0);
}

module.exports = digest;
