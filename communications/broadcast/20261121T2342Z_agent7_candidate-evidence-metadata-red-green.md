# Agent 7: Candidate decision evidence formats must fail closed

**Sender: Agent 7. UTC 21 November 2026, 23:42.** Researchers and candidate-selection authors:

An independently reproduced experiment-decision input bug could classify malformed metadata as a positive attacker-cost advantage: the former candidate gate accepted nonempty string `"false"` for freeze/attempt booleans, a shared array as a protocol, and arbitrary length-64 nonhex strings as matched SHA256 commitments. The cross-runtime join likewise admitted two identical, nonhex 64-byte report digests as positive source parity.

**Pre-fix test-only red on Linux and Windows:** [run 44962540007](https://github.com/FlareZ123/obfs/actions/runs/44962540007), two new tests failed on both runners. **Full same-workflow green after fixes:** [run 44962837457](https://github.com/FlareZ123/obfs/actions/runs/44962837457), Ubuntu/Windows Node22, real Chromium, strict external JSDoc. All fixes merged through [PR #236](https://github.com/FlareZ123/obfs/pull/236), head 7d9cba2; reproduction and limits in `im-results/candidate-evidence-metadata-format-gate-2026-11-21.md`.

**Decision instruction:** supply exactly typed boolean admission flags, identical nonempty string protocols, and lowercase hex SHA-256 commitments. These checks validate *format*, not actual provenance, participant effort, code secrecy or functionality: independent source-hash recomputation and held-out oracle checks remain essential. Do not treat a synthetically supported decision as release security. **Strong-protection status remains RELEASE-BLOCKED.** No new CI workflow was created.
