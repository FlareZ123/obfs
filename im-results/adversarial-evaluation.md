# Preliminary security and compatibility evaluation (Agent 7)

Date: 2026-11-15. The accompanying executable artifacts are in `src/`, `test/` and `bin/`. Evidence classification: reproducible local software tests and heuristic threat-model analysis. These observations have not been independently replicated or established as publishable academic results.

## Behavioral equivalence

`node --test test/*.test.js` runs 34 named tests, including 1,200 generated alias/reflection programs and 800 generated destructuring programs from fixed xorshift seeds. Every tested original and obfuscated program produced the same JSON-serialized result, or was explicitly excluded when original execution failed. Tests also exercise 4-file ESM direct imports, forward calls, exported aliases, mixed ESM/CJS rejection, external browser API paths, Unicode, SNO manifests, SCO HTTP mutation, SCO authenticated remote computations, and CLI path collision rejection. `npx tsc -p jsconfig.json` reported zero static JSDoc errors. Local Node version: 22.16.0; local Acorn version: 8.15.0. The declared npm semver ranges were not yet validated on a clean install.

A concrete regression caught during development: an aliased `const` object exported from ESM could retain its original name while a local AST pass changed its keys, silently breaking external access. The analyzer now rejects alias exports; the regression is covered by automated tests. Closed-world cross-file renaming also refuses any source group containing scripts, CommonJS, or opaque assets, since outside imports and embedded code can observe object shape. Lexical containment checks prevent false alias identification outside a binding's block/function scope. Assignment of a function or other unproven nonprimitive into any aliased own field now disables the property rename, since the installed method could introspect `this` keys. Simple destructuring is rewritten jointly with object declaration keys; computed/rest/default destructures still force rejection.

## Independent threat dimensions

| Dimension | Testable observation | Residual risk |
|---|---|---|
| Static reconstruction | Literal strings are XOR-encoded and lexical/property names seeded; output is executable JS. | Decoder, seed-derived names, and control flow are visible; automated deobfuscation is feasible. |
| Dynamic extraction | `test/adversary.test.js` reads plaintext from the decoder table after JavaScript initialization without invoking the protected application function. | Full client instrumentation trivially reveals local assets and values. |
| Tamper resistance | The SNO launcher detects modification to entry files when it itself is intact. | The same adversary can replace the launcher; regression test proves this bypass. |
| Environment locking | An unauthorized simulated hostname triggers a guard error. | An attacker with browser-context control supplies a forged allowed hostname and runs the code; demonstrated by regression test. |
| SCO secrecy | Server-resident RPC methods are unavailable in delivered source and require caller-provided authorization. | Unlimited legitimate requests can reveal functionality through black-box probes; RPC may also violate latency budget for fine-grained calls. |
| Runtime efficiency | Three Node microbenchmarks after warmup achieved medians near 1.0x (one string case faster). | Sampling is narrow; no universal upper bound of 2.5x, especially in short-lived client scripts. |

## Browser validation status

`npm run test:browser` is an optional Chromium headless integration harness testing two-file ESM import behavior and host-gated classic scripts. Chromium 144 was present in the research container, but its `--dump-dom` operation stalled even for a standalone `data:` smoke page; D-Bus connection errors were observed. Browser compatibility remains unverified in that container and should not be described as passing. The test needs rerunning on a functioning Chromium host (set `CHROMIUM_BIN` as necessary).

## Research direction

The most valuable next improvements are a real lexical-scope and escape-analysis engine, caller-aware whole-program dataflow across ES module graphs, opt-in selective transformation profiles with per-workload benchmarking, and a reproducible instrumentation-resistant evaluation harness. The current architecture optimizes for safe refusal; it sacrifices coverage, especially for reflection-heavy applications.
