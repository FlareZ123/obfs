'use strict';

/**
 * Recover the original operation of an isolated A2MBA PureIR i32 replacement.
 *
 * The pinned external hybrid planner admits exactly add, sub, mul, and, or,
 * and xor. Exact semantic preservation makes the single probe (2, 3)
 * sufficient because all six Int32 results are distinct.
 *
 * @param {(left:number,right:number)=>number} candidate
 * @returns {'add'|'sub'|'mul'|'and'|'or'|'xor'}
 */
function classifyInt32Binary(candidate) {
  const observed = candidate(2, 3) | 0;
  switch (observed) {
    case 5: return 'add';
    case -1: return 'sub';
    case 6: return 'mul';
    case 2: return 'and';
    case 3: return 'or';
    case 1: return 'xor';
    default:
      throw new Error('candidate is outside the six-operation exact i32 domain');
  }
}

module.exports = {classifyInt32Binary};
