# SCO per-request variant ordering under generated host guards

**Date:** 2026-11-21. **Agent:** 8. **Classification:** intermediate correctness and integration repair.

## Reproduced failure

The existing integration test in `test/obfuscator.test.js`, `SCO returns distinct obfuscation on repeated legitimate requests`, failed consistently on both operating systems at source pin `9e257da44946136dbcef8303774c72a26b33f50b` in manual cross-reader run [44928133463](https://github.com/FlareZ123/obfs/actions/runs/44928133463). Both authorized HTTP responses were HTTP 200 but had exactly the same public JavaScript text. The source was a straightforward assignment `globalThis.value='long-long-value'` and the original user-facing behavior was intact. The per-request variant expectation was unfulfilled.

The handler previously called `obfuscateFiles` with `allowedHosts`, obtaining a generated host-guard prefix, and then applied `varyLiteralSpellings` to the **guarded output**. The spelling pass's own `observesFunctionSource` safety veto was therefore executed against synthetic guard code containing a potential `Error`/stack observer. This obscured the original eligibility decision and produced no spelling variation. Changing the test's original lexical binding alone did not solve the false-negative variation, establishing that the behavior came from the pass ordering rather than the particular source fixture.

## Repair

The current branch runs `varyLiteralSpellings` on the **original JavaScript input**, after the source-observer publication decision and before `obfuscateFiles` adds its generated host guard. The same nonce is retained for all per-request transformations. A source-observing input still invokes the existing eligibility veto, and the multi-file/interfile source-observer gate still declines variation. The public response is the compiler output, with no second source rewrite after host guard generation.

Original string value semantics are preserved by the spelling pass: each UTF-16 code unit is emitted as either its safe printable ASCII character or an explicit four-digit Unicode escape within a standard quoted string. Expression-site eligibility stays limited to direct string initializers and assignment right-hand sides. The generated runtime does not need a new decoder, and the change does not intentionally introduce extra client compute.

The integration test now requests four authorized variants and asserts at least two distinct bodies, avoiding a false failure if two independent random spelling masks happen to match. It retains the original runtime result check and unauthorized Host HTTP 403 check.

## Evidence and remaining limits

- Red: [manual cross-reader run 44928133463](https://github.com/FlareZ123/obfs/actions/runs/44928133463), both OS failed only the existing SCO variant assertion (other focused source tests passed).
- First code-only green: [manual cross-reader run 44928877513](https://github.com/FlareZ123/obfs/actions/runs/44928877513), on exact source `ed7eb438469be11b5869b31a76ba505a83fae03c`, including the original per-request variant test on Ubuntu and Windows.
- Final run with four-request collision-robust regression: [manual cross-reader run 44929020760](https://github.com/FlareZ123/obfs/actions/runs/44929020760) completed successfully on **both Ubuntu and Windows** at exact executable SHA `06cc3c6a3c2d2fb79bfe634649a85d77e0438324`. The wider suite includes native/emitted ESM host locks, SNO loader integrity, SCO HTTP policy and project JSDoc on both platforms.

This repair restores one experimentally required SCO behavior for the recognized safe source family. It neither proves that randomized escaped literals resist normalization nor changes the trusted-server and authorized-request-relay threat boundaries. The main strong-protection release remains blocked.
