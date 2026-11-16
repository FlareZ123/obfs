'use strict';

function route(value, flag, hook) {
  var score = (value | 0) * 7;
  if (flag) {
    hook('allowed');
    score += 31;
  } else if (score > 20) {
    hook('fallback');
    score ^= 15;
  } else {
    hook('minimum');
    score -= 9;
  }
  return (score ^ 19) | 0;
}

module.exports = {route};
