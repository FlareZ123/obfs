# SCO inter-file source observation: per-response polymorphism compatibility regression

**Status:** reproduced before correction on Ubuntu and Windows Node.js 22; corrected in the current Acorn implementation and checked in the manual Linux/Windows suite. Intermediate software-engineering evidence, not an academic security result.

## Requirement and observable behavior

ECMA-262 §20.2.3.5 `Function.prototype.toString` returns the exact available source text for an ordinary user-defined function. An obfuscator that changes source characters of a function reachable by a supplied consumer can change program behavior even when the function's return value remains identical. Reference: https://tc39.es/ecma262/2026/multipage/fundamental-objects.html#sec-function.prototype.tostring

SCO's `createScoHandler` parses the supplied file group for closed-world cross-file property analysis, but transforms and varies each HTTP GET separately. Its former per-file `obfuscateFiles([confirmedFile], ...)` call could not see a source observer in another served module. The additional `varyLiteralSpellings` pass randomized quote/Unicode-escape spelling of a function-local string declaration after the per-file pass.

The minimal test graph contains:
- `state.mjs`: exports ordinary functions `describe` and `stringify`. Their bodies contain an own-key read and a string literal, respectively.
- `entry.mjs`: statically imports them and serializes their `toString()` text alongside normal return values.
- `test/sco-interfile-source-observation.test.js`: serves both files from a real loopback HTTP server, saves the delivered JavaScript, and executes the resulting native ESM graph in a separate Node process. It compares output byte-for-byte with the original graph.

## Evidence sequence

1. Pre-fix regression commit `2d934291ca9e730d628c704bd212edd7ad457d86`. Manual CI [43691221059](https://github.com/FlareZ123/obfs/actions/runs/43691221059) failed this new test on **both Ubuntu and Windows**. The measured value remained `7sensitive-example-text`, but `stringify.toString()` included randomized `\\uXXXX` escapes instead of the original plain characters. Other concurrently added tests also failed in this run; the reported 11 failures are not attributed to this single defect.
2. Fix commit `d43fe70c89d60c7ff104be050a7ebac3ca49406b` computes `interfileSourceObserver` from the full source-file group. When present, it disables per-file local property/identifier renaming and per-request literal respelling in SCO. Manual Linux and Windows CI [43691325052](https://github.com/FlareZ123/obfs/actions/runs/43691325052) **passed** both matrix jobs.
3. Expanded test commit `dc40735deeae547a10b21882711d0fdaa8761677` moves the function declarations outside the export statement, making both local property/identifier renames eligible absent cross-file observation. Manual Linux and Windows CI [43691523344](https://github.com/FlareZ123/obfs/actions/runs/43691523344) **passed** both matrix jobs.

All three workflows were dispatched manually; no per-commit CI trigger was added.

## Tradeoffs and limits

The correction declines mutations for the **entire published file group** if a known source observer exists in any executable file. That conservatively sacrifices obfuscation coverage for independent modules. A future precise ESM import/export and function ownership proof could narrow the refusal scope, but must demonstrate soundness with real loader tests and include a coverage measurement. The current source-observation detector is syntactic and does not prove safety under arbitrary external consumers, monkey-patched intrinsics, or dynamically constructed observers. Serving source still exposes it to hostile clients; this is strictly a semantic correctness repair, not a new anti-extraction protection.

Related: `src/ast.js` tracks source observations, `src/core.js` already declines whole-group local transforms for known remote observers, and `test/source-introspection-safety.test.js` covers individual and batch COO/SNO transformations.
