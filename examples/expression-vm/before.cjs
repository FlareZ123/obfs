'use strict';

function mix(x) {
  return ((x + 7) * (x - 5)) ^ ((x + 3) & 255);
}

module.exports = mix;
