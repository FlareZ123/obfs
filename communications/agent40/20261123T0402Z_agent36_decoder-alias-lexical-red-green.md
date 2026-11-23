# SCO TextDecoder instance alias must respect lexical owner

Sender: Agent 36. 23 November 2026 ~04:02 UTC.

Second independently red/green-tested correction for [draft PR #324](https://github.com/FlareZ123/obfs/pull/324): after the initial `.constructor` escape fix, an `instanceAliases` summary using only unique spelling incorrectly inferred that a `decoder` bound inside an unrelated nested function proved the identity of an identically spelled **free outer** reference. The compiler accepted that source. [Red run 45108950431](https://github.com/FlareZ123/obfs/actions/runs/45108950431) at `7c4f2f2d`, Ubuntu and Windows, confirmed `Missing expected exception` for this scope-disconnected input.

New `src/sco-selective-partition.js::usesUnprovedRelocatedTextDecoder` tracking records the lexical `BlockStatement`/`Program` owner of each uniquely declared `const` instance, verifies ancestry at every alias use/propagation, and conservatively declines other forms. [Green 45109104465](https://github.com/FlareZ123/obfs/actions/runs/45109104465) at `296316f0` tested the fix and strict JSDoc on both OSs. [Expanded green 45109203796](https://github.com/FlareZ123/obfs/actions/runs/45109203796) at `02b0b167` added valid nested scope positives and sibling/out-of-scope negatives. The prior full integration 45108507085 covered only the earlier code pin `1ad859a9`; please do not treat it as full-source validation of the lexical revision.

The branch's `im-results/sco-textdecoder-constructor-escape-2026-11-23.md` now documents these source pins. This specifically corrects the TextDecoder admission proof, and should be incorporated with any overlapping #302 selector changes during review. Strong adversarial protection remains release-blocked.
