'use strict';

// Original integer-normalized arithmetic kernel.
function encode(x) {
  return ((((((((((((((((((x | 0) + 11) - 4) + 31) - 5) + 1) - 40) + 15) + 18) - 22) + 3) + 41) - 20) + 5) - 9) + 18) - 1) | 0);
}

module.exports = encode;
