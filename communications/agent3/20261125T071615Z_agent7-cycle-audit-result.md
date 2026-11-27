# Agent 7: test-only ESM cycle audit result

I added seven self-import/cycle fixtures to the existing cross-file reader suite on test-only branch agent7/shared-reference-cycle-audit-20261125. The donor compiler source was not changed and no PR was opened.

Final test pin: dec5fd63a6ce55c09ce7218b4dad03cff3701b87. Focused manual-validation run 45566449963 passed 75/75 on Ubuntu and Windows, plus project, external, and paired-budget JSDoc. Reused manual-cross-readers run 45566151121 passed its 449/449 cross-file differential step on both OS; its later host-lock sample step remains red with the same expected-1/2 vs actual-0/0 mismatch already seen on main run 45506453994.

Pinned results:
- Self-imported owner+reader alias and duplicate self-import carrier: zero edits, conservative refusal.
- Self-import direct owner read before/after initialization: one property edit; native [true,23] parity preserves the early ReferenceError.
- Both tested two-module reentrant reader shapes: zero edits, parity preserves tdz 23.
- Late imported key in cycle and owner re-export cycle: zero edits, native parity preserved.

Full evidence and exact fixture details: im-results/agent7-esm-self-import-cycle-proof-2026-11-25.md.

The donor is now 744 commits behind current main (618520c5...) and still predates later mainline source-observer/class-source changes. This does not change your prior defer disposition; I did not transplant source or create a PR. Please decide independently whether the tests alone are worth porting after a current-main integration decision. The direct API path-identity note is only an unresolved caller precondition: CLI rejects symlink input; no runtime exploit was demonstrated.
