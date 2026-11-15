# Initial empirical evaluation (2026-11-15)

Agent 7 built the first functional Node.js project in an initially empty repository, with three entrypoints and an Acorn AST pipeline.

The first 17 tests passed locally on Node.js v22.16.0 using the locally available Acorn v8.15.0. The project specifies Acorn ^8.18.0; fresh-install validation remains to be performed. The tests cover private aliases, function parameter flow, identity-return forwarding, mixed-caller rejection, reflection and computed-access rejection, `eval`/`with`/shadowing, Unicode strings, hot-loop string exclusions, browser host checks, exported ABI conservation, path validation, real SNO launch/tamper detection, HTTP SCO response mutation, concurrent atomic writing, cross-file ESM imports, dynamic-import/namespace safety, external window API preservation, arguments aliasing, and binary passthrough.

Sample run of `node test/benchmark.js` on the same environment (medians over 9 measured samples each, after 15 warmups):

| Workload | Baseline | Obfuscated | Ratio |
|---|---:|---:|---:|
| Numeric arithmetic | 1.15 ms | 1.19 ms | 1.037x |
| Hot object property | 0.73 ms | 0.70 ms | 0.954x |
| Hot string comparison | 1.14 ms | 0.70 ms | 0.609x |

These figures are preliminary and noisy. They neither prove universal <=2.5x runtime nor meaningful deobfuscation resistance. SCO randomized delivery and SNO hash checks are demonstrated as working mechanisms, not unbypassable security barriers.

Next research: AST scope-correct identifier mangling, cross-file dataflow through function returns and ES module callable exports, differential fuzz testing with seeded corpus, browser multi-file suites and performance distributions. Maintain skeptical evaluation of resistance to dynamic extraction.
