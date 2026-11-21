# Strict UTF-8 source admission and SNO package metadata (21 November 2026)

## Scope and reproducibility

The input-tree reader previously converted every JavaScript `.js`, `.mjs` and `.cjs` Buffer to text with `Buffer#toString('utf8')`. Node substitutes U+FFFD for malformed byte sequences during that conversion. A compiler therefore could silently analyze and publish a different source text from the bytes supplied by the operator.

The bounded repair validates each JavaScript Buffer with Node 22's native `node:buffer.isUtf8` before decoding. On an invalid byte sequence the CLI raises `TypeError: Invalid UTF-8 JavaScript source: <relative path>` before output-directory creation. A valid UTF-8 BOM is retained as text, and non-JavaScript opaque assets retain their original Buffer bytes. This is an input consistency property, with no claimed obfuscation-strength gain.

The CLI and independent direct SNO launcher API also consult `package.json` when classifying a `.js` file as CommonJS or ESM. Both now refuse an invalid UTF-8 Buffer for any consulted package metadata rather than constructing a lossy JSON string. The API's string inputs retain the previous contract. The check does not validate unrelated unconsulted opaque assets, does not establish a filesystem race boundary, and does not prevent a hostile deployer from replacing outputs.

## Exact implementation and checks

- Mainline implementation: `src/cli.js` native JavaScript byte check at commit `ae785b712677800c11caac1fe5eac5586cb06764`; additional CLI package metadata at `f0e53662bc1be0806dab48bbadaf000cd42a6a4b`.
- Direct SNO API: `src/sno.js` package metadata byte validation at `60c007a6a1491762e7936d01dd62f293fd55763b`.
- `test/cli-utf8-input.test.js` asserts exact Unicode/BOM and opaque binary preservation, six malformed UTF-8 classes across all three JS extensions, and output directory absence on failed CLI invocation.
- `test/sno-package-utf8.test.js` exercises both direct-launcher package-scope bytes and actual SNO CLI preflight.
- Exact combined candidate (all of the above) is immutable commit `6c639d3d1efc6125ed7cb8ffdc160cfca793c66f` on branch `agent4/utf8-source-package-final-20261121`.
- Dispatched full Node 22 Ubuntu/Windows and Ubuntu Chromium `.github/workflows/manual-validation.yml` via [workflow run 44937302595](https://github.com/FlareZ123/obfs/actions/runs/44937302595). **In progress at writing. Do not claim verified green yet.** Earlier superseded candidate runs [44936804321](https://github.com/FlareZ123/obfs/actions/runs/44936804321) and [44937061584](https://github.com/FlareZ123/obfs/actions/runs/44937061584) are scoped to earlier source.

## Implications

Rejecting ambiguous malformed input is a conservative build-contract improvement that prevents accidental silent source substitution. The project remains release-blocked for the primary adversarial objective. Node API validation overhead occurs during compilation, outside the protected application's runtime; no universal 2.5× runtime claim follows. The independently documented full-control COO/SNO attackers and same-account SCO relay are unaffected.


## 21 November validation update

- The earlier native `isUtf8` candidate at `77f9e0e4b6c84e5b42ec8a2ac39396a401159c7d` passed both full Node 22 jobs, JSDoc, benchmarks and Ubuntu Chromium in [44937061584](https://github.com/FlareZ123/obfs/actions/runs/44937061584).
- The expanded byte-class and package-scope candidate at `6c639d3d1efc6125ed7cb8ffdc160cfca793c66f` ran in [44937302595](https://github.com/FlareZ123/obfs/actions/runs/44937302595). Ubuntu completed successfully. Windows had **4,091 pass, four skip, one fail**, in unchanged `test/sco-webauthn-proof-cpu-budget.test.js` because `sims/sco-webauthn-proof-cpu-budget.js:143` asserted positive `process.cpuUsage` for every pair and observed a resolution failure. Both Windows JSDoc steps and sampled performance profiles passed. The blind-audit artifact upload error followed from the failed test step and was secondary. This is not a green two-OS integration; it also does not attribute the CPU clock failure to the UTF-8 patch. The separate later source-fidelity combined candidate is pinned on `agent4/source-fidelity-portability-20261121`.
