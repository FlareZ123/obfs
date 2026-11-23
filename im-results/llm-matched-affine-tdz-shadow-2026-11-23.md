# Symbolic affine recovery: lexical TDZ falsifier and repair

**Agent:** 14  
**Date:** 23 November 2026  
**Classification:** intermediate adversarial-analysis correction; not a production compiler change  
**Research branch:** `agent14/llm-matched-affine-evaluation-20261122`  
**Final tested source:** `b771c68905c660b109c4c306b51279759e902114`  
**Release decision:** unchanged — RELEASE-BLOCKED.

## Finding

Agent 16 supplied a generated-looking two-path function whose inner block reads `slot`, returns, and then declares a second `const slot`. JavaScript lexical bindings apply to the entire block; the later declaration places the earlier read in the temporal dead zone even though the declaration is textually after an unconditional return.

The native Node 22 observation was independently reproduced:

- `round1(0)` throws `ReferenceError: Cannot access 'slot' before initialization`.
- `round1(1)` returns `18`.

Before the repair, `block()` in `sims/polyvariant-affine-symbolic-recover.js` evaluated children in order and returned immediately on the first `ReturnStatement`. It therefore never examined the later declaration and incorrectly treated the earlier `slot` reference as the outer symbolic register, yielding offset 17 for both cases. This was a real false-positive in the source-only proof recognizer for arbitrary generated-looking input; it did not demonstrate that the actual emitter produced this shape.

## Repair

The symbolic block visitor now preflights the complete direct block before evaluating expressions. It accepts only the restricted emitted grammar (single-binding initialized `const`, nested blocks, and a terminal return), rejects unsupported declarations/statements, and refuses any return that is not the last statement in its block. In particular, it cannot stop at a return and silently omit a later lexical binding.

This is deliberately conservative. It is a correction to the *attacker's proof boundary*, not an obfuscator-security improvement. The actual generated grammar remains supported by the existing 96-case emitted-output differential test.

## Red/green evidence

- **Red witness:** [manual-validation run 45102547683](https://github.com/FlareZ123/obfs/actions/runs/45102547683), exact source `fdfe4731106c5a0f1da6b112a20a545cdb728835`. The new TDZ regression failed on both Ubuntu and Windows because the old recognizer did not throw. The same run's fresh challenge-A solver test succeeded on Ubuntu; Windows initially exposed only a fixture line-ending/hash mismatch.
- **Line-ending correction:** the challenge fixture is 5,339 canonical LF bytes. The regression now normalizes Windows checkout CRLF to LF before comparing the published SHA-256, without changing the bytes supplied to the parser.
- **Green repair:** [manual-validation run 45102784023](https://github.com/FlareZ123/obfs/actions/runs/45102784023), exact source `b771c68905c660b109c4c306b51279759e902114`. The focused `test/llm-matched-affine-static-attack.test.js` passed on Ubuntu and Windows, as did strict project and external JSDoc checks. The test includes the native TDZ observation, refusal by both `recoverSymbolicAffine` and `attackPublishedSource`, and the existing 96 positive emitted cases.

## Fresh public-source challenge A

The test pins canonical public source SHA-256 `25317afcc40deeeb845472732d07c480ce55477ec6057ea18527873e8b1332ca` and applies the existing symbolic solver to the three exported functions. It recovered all three translations without executing the distributed functions, using a runtime oracle, reading hidden source, or importing compiler/transform internals. The recovered offsets are reported privately to the challenge sender rather than included in this public report.

This is a programmatic source-only solver check, **not** a blind LLM trial: the challenge source was available to the repository tools and the solver was executed by CI. It supplies no evidence about model-only deobfuscation difficulty or blind-review compliance.

## Remaining limits

- The recognizer proves only its admitted generated affine grammar; it is not a general JavaScript semantic analyzer.
- A successful parser/test correction does not improve COO/SNO confidentiality or hostile-runtime integrity.
- No new protected-runtime performance claim is made.
- PR #282 remains an independent research-review branch; this change does not modify `src/` or authorize release promotion.

## Next review

Ask Agent 16 to confirm the source-pinned fix rejects the supplied witness while preserving the positive emitter cases. Ask Agent 13 to compare the private verifier's expected offsets with the independently recovered public-source answer. Retain the distinction between static source-only automation and an isolated no-tools LLM evaluation.
