# Conservative decoder intrinsic-alias proof: executable regressions

Date: 2026-11-15. Agent 7. Intermediate software-engineering evidence, not a publishable security result.

## Observed failure and repair

The obfuscator's one-time XOR decoder calls `String.fromCharCode` and `string.charCodeAt`. For long strings, its chunked variant also spreads temporary arrays and thereby depends on `Array.prototype[Symbol.iterator]`. In a supplied multi-file group, an earlier file can mutate those built-ins before a later file initializes the decoder. If aliases to the built-ins are not found, the compiler may insert a decoder that changes behavior or fails at runtime.

The existing `mutatesDecoderIntrinsic` fixed-point traversal in `src/core.js` tracked direct `String`, `Array`, `prototype`, and `Object.getPrototypeOf` patterns. It missed certain equivalent alias forms. The `test/ambient-string-alias.test.js` corpus now includes executable CommonJS graphs with an earlier side-effect file and a later literal-bearing file; both SNO and explicitly requested COO string encoding must decline when a dangerous alias is observed.

### Independently reproduced before fixes

| CI baseline | Alias counterexamples observed | Cross-platform outcome |
|---|---|---|
| [43688078170](https://github.com/FlareZ123/obfs/actions/runs/43688078170) at `b4e4dbca` | `"".__proto__.charCodeAt`; `[].__proto__[Symbol.iterator]` (two negative cases) | Ubuntu and Windows both failed those two semantic assertions |
| [43688538859](https://github.com/FlareZ123/obfs/actions/runs/43688538859) at `1ea22f6a` | `"".constructor.fromCharCode`; `"".constructor.prototype.charCodeAt`; `Object.getPrototypeOf(new String("x")).charCodeAt`; `[].constructor.prototype[Symbol.iterator]`; `Object.getPrototypeOf(new Array(2))[Symbol.iterator]` | Ubuntu and Windows both failed those five assertions |

The test failures were observed while the new regression cases were present and before the respective source fixes. They are not inferred from a source-code guess.

### After fixes

- `src/core.js` now recognizes statically evident primitive and constructed-instance aliases to the `String` and `Array` constructors, their prototypes, and their inherited `__proto__` field.
- New fixed-point discoveries propagate into the existing conservative mutation refusal. A later file's decoder is suppressed rather than emitted against a potentially modified runtime.
- [43688356083](https://github.com/FlareZ123/obfs/actions/runs/43688356083) succeeded on both platforms after the `__proto__` fix and independent JSDoc annotation repair.
- [43688639056](https://github.com/FlareZ123/obfs/actions/runs/43688639056) succeeded on both platforms after the constructor/prototype extension, including the selected semantic corpus and strict JSDoc typecheck. This green run was at `f88dffe6`. The test excludes unrelated full-suite VM research failures.

## Interpretation and limits

These changes improve correctness for recognizable forms of cross-file built-in mutation. The compiler still cannot prove that arbitrary reflective aliases, proxies, dynamically constructed code, runtime loader customization, or external modules leave these intrinsics unchanged. Such code may need more conservative disabling of the optional decoder. The tests do not establish a general closed-world proof, static extraction resistance, runtime tamper resistance, or the universal 2.5× compute bound.

The narrower opt-out for *write-only* `.toString=...` in `src/ast.js` is a separate optimization: it avoids misclassifying a plain property overwrite as function-source introspection. That update and its relevant semantic tests passed [43687960535](https://github.com/FlareZ123/obfs/actions/runs/43687960535) before the alias additions.

The main current implementation remains a conservative baseline rather than a broadly secure arbitrary-program compiler.
