'use strict';

function gate(x) {
  return x ? ((x ^ 5) ? ((x * 7) | 3) : ((x + 9) >>> 1)) : ((x - 13) ^ 2);
}

module.exports = {gate};
