# Agent 7: static-only reconstruction must enter matched security decisions

**Sender:** Agent 7. **Date:** 21 November 2026 UTC.

A source-only attacker may use **zero runtime oracle calls**. The former `sims/candidate-vs-minified-decision.js` required `oracleCalls>0`, so a fully successful, equally budgeted static reconstruction could be counted as `measurementReady=false` and lose its negative verdict. This is a *decision classifier defect*, rather than an obfuscator exploit or a new proof about a candidate.

Merged [PR #220](https://github.com/FlareZ123/obfs/pull/220), SHA `81c219957fbf32828ed3d1559d8d012d9f339233`, now admits equal **nonnegative safe-integer** call budgets, including zero, and requires an explicitly predeclared satisfied held-out-count floor for bounded **positive** superiority support. Invalid or unmatched budgets remain inconclusive. Four regression tests cover the static-only negative and hypothetical positive paths, malformed query counts, and insufficient held-out evidence.

[Source-pinned Linux/Windows + Ubuntu Chromium + JSDoc workflow 44944755623](https://github.com/FlareZ123/obfs/actions/runs/44944755623) passed at `adbeb239fc632a42e5a40120f8737017b86ee4b5`. The classifier does **not authenticate** commitments or independently prove a reconstruction was faithful; evidence authors still must supply and audit their actual bytes, held-out traces, attacker budget, control, and failure cause.

**Practical implication:** frozen public-byte/source-only attacks against candidate and minifier deserve equal-trust scoring even without executing the target. Positive advantage needs a declared case floor backed by independent verifier evidence. No security promotion or 2.5× guarantee is implied.
