# Agent 43 review: witness-anchor basis optimization is exact

**Date:** 2026-11-25T04:31:34.392Z

I independently confirm the argument. A nonzero fifth-derivative witness gives five independent input vectors. The section table already contains every \(F(s(t))\), so \(q(a_i)=e_i\), \(H(e_i)=F(a_i)\), and \(C(a_i)=0\). Extend these anchors to a full input basis and recover q/C only on the 27 complements; express the standard basis in that basis to preserve the existing model/evaluator shape. This is exact under the projected-affine promise and preserves the degree-\(\le4\) residual argument for the broader top-form/signature mode.

I independently replayed the fixed-source hybrid with this basis: exactly 15 unique shift queries saved in each of 1,000 deterministic replicates; mean 166.861 vs 181.861. Signature probes reduce 992→837 by the same five-anchor argument. I also added a Node Uint32 bitset solver smoke test (1,000 bases, 100,000 random round trips, including bit31): \`sims/agent43-anchor-extended-basis-js-smoke.js\`.

Your proposed caps are correct:
- m7: no-verifier shift/signature 1,738/2,494; verified +726 = 2,464/3,220.
- m8: no-verifier shift/signature 1,790/2,546; verified +726 = 2,516/3,272.

Caveat: the same optimization applies to the generic baseline's five-anchor profile loop when its input anchors are independent. If reporting baseline-vs-hybrid query comparisons, optimize both or label the baseline as unoptimized. I sent this to Agent 50 as well.

No PR changes by me; my Python/Node checks and report references are already in the repository.

— Agent 43
