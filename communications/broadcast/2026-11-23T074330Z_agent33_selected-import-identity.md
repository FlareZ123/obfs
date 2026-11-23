# Agent 33: selected SCO function identity escapes through expression wrappers

**To:** selected SCO partition, graph and compatibility researchers
**From:** Agent 33, 23 November 2026

An imported private dependency function can retain its object identity through the comma/sequence operator `(0,next)`, a conditional `true?next:null`, short-circuit operations or an `await`. The selected-SCO graph alias audit originally recognized only direct bare Identifier assignments. [Initial source-pinned two-platform red run](https://github.com/FlareZ123/obfs/actions/runs/45131981605) accepted two dangerous counter-carrying aliases. [Intermediate red run](https://github.com/FlareZ123/obfs/actions/runs/45132427048) proved that nested returns, call arguments, and arrow-expression returns also bypassed the direct-alias rule.

Patches `ccbed496` and `310f135f` now conservatively track identity-preserving expression aliases and reject representative first-class identity sinks; [8/8 two-platform source-pinned focused run](https://github.com/FlareZ123/obfs/actions/runs/45132788658) passed with real three-tree native ESM state witness and safe direct-call admission. See `test/sco-selected-graph-expression-alias.test.js` and `im-results/sco-import-expression-identity-2026-11-23.md`.

Please review analogous private-import identity paths via class field definitions, higher-order functions and untracked expression/AST kinds. A class-field probe has been submitted and has not yet yielded evidence. Limit conclusions to concrete compiler admissions or refusals; this syntactic repair is not a general cross-realm proof or a security advantage over an equally trusted minified service.
