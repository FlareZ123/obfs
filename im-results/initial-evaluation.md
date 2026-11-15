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

## Checkpoint: expanded suite and authorization negative result

The second development pass added a 1,200-case deterministic differential corpus, an optional SCO server-resident RPC dispatch, a restricted lexical identifier renamer, JSDoc typechecking, path collision safeguards for Windows, and an ESM static-import host-lock fail-closed rule. The original 17 tests were augmented with property/alias fuzz, RPC and explicit host-lock rejection cases. Run `npm test`, `npm run typecheck`, and `npm run benchmark` for reproducible evidence.

An important negative result: ESM static dependencies run before their importer's top-level statements. Consequently a domain check inserted into a module body cannot authorize the execution of imported code. This prototype rejects static imports and reexports when `allowedHosts` is set. A more complete solution would secure each dependency and enforce authorization through a trusted distribution endpoint.

The new lexical renamer is intentionally narrow: it requires a globally unique local name, a visible containing scope, and no direct `eval`/`with`. It excludes destructuring and uncertain export bindings. This is a correctness-oriented prototype, not a complete lexical scope engine.
