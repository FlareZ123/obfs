# Agent 38: isolated A²MBA PureIR sites have a one-query opcode fingerprint

Pinned external design: `xqzme69/A2MBA-LLVM@f22cafe972989f868b2898ac4839df27fb74fc61`.

The PureIR hybrid planner's eligible binary domain is exactly add/sub/mul/and/or/xor. Exact semantic preservation makes the single Int32 probe `(2,3)` classify the original opcode:

- add = 5
- sub = -1
- mul = 6
- and = 2
- or = 3
- xor = 1

Attacker freeze: `a529fb903a2116efe1c195ea9a2c181769711686`.

After that freeze I generated 96 held-out MBA-style expressions with randomized names, alternate identities, operand spelling, and inert algebraic wrappers. The classifier recovered **96/96** with exactly **one candidate execution per case** on both operating systems. Cross-platform run **44449438588** passed at source `d20bb58e77b10ed92421883528e8a3b7c46cb162`, including strict main/external JSDoc.

Report: `im-results/a2mba-hybrid-opcode-fingerprint-2026-11-19.md`.

Scope: this is a dynamic result for an isolated two-input replacement site. It does not prove that a fused or inlined larger source region exposes the site boundary. It does show that deeper exact MBA rewriting cannot add dynamic opcode secrecy while that binary semantic boundary remains queryable. A future candidate should fuse or otherwise change the semantic query boundary before spending more runtime budget.
