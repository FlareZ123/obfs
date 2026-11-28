# Exported-factory multi-root Chromium receipt (intermediate)

**Agent:** 9  
**Date:** 2026-11-28T19:57:02.886Z  
**Research branch:** `agent9/factory-distinct-roots-carrier-20261128`  
**Browser-tested source SHA:** `8a2184bde463a032e987480ff0776b03d8f76a2a`  
**Workflow:** [Manual exported-factory multi-root Chromium run 46183227194](https://github.com/FlareZ123/obfs/actions/runs/46183227194)  
**Status:** Real-browser COO validation green; not current-main integration or release acceptance.

## Browser correctness coverage

The browser harness serves native, esbuild-minified and obfuscated COO module graphs under a same-origin CSP. The positive graph:

- creates two distinct objects from one exported zero-argument factory;
- carries them in separate object-record and tuple slots;
- captures each slot in local aliases;
- forwards one root through an imported pure identity function;
- reads both factory fields through the aliases in a private direct-call-only reader.

The compile-time proof requires exactly one proven object and two actual property rewrites. The browser imports all three variants and requires identical checksums.

The same run also tests the negative URL-identity graph. A C0-containing import path `./a/.\\t/../state.mjs` must select the root factory under browser WHATWG URL semantics, not the POSIX decoy. The obfuscator must refuse the ambiguous factory importer inventory (`crossFile.properties === 0`), and native, minified and obfuscated browser imports must all return 23.

## Performance sample

Two warmup rounds and nine measured rounds per variant; each measured module evaluation performs 5,000,000 calculations.

| Variant | Median |
|---|---:|
| Native | 2.80 ms |
| Minified | 2.80 ms |
| Obfuscated | 2.60 ms |

- Obfuscated/native: 0.9286×
- Obfuscated/minified: 0.9286×

These short timings are a smoke measurement, **not** a reliable per-property-access cost measurement or universal 2.5× proof. The accepted factory proof is read-only for nonliteral writes, and V8 may inline/constant-fold the private read-only object graph. An attempted stateful-write benchmark was correctly refused by the proof because its nonliteral assignment RHS lies outside the accepted grammar (run [46183410870](https://github.com/FlareZ123/obfs/actions/runs/46183410870), failed at the harness's expected-object assertion). The benchmark was reverted to the supported read-only graph. Do not interpret the ratio below 1.0× as a speedup.

## Separate source-observation negative control

The factory test suite now includes an in-program source-observer falsifier covering `makeState.toString()`, `Function.prototype.toString.call(makeState)`, and `Reflect.apply(Function.prototype.toString, makeState, [])`. It requires zero cross-file edits and native/emitted parity in COO/SNO/SCO. Focused run [46183580313](https://github.com/FlareZ123/obfs/actions/runs/46183580313) passed on Ubuntu, Windows and macOS.

External attacker inspection of transformed source remains expected. The source-observer guard is about program-visible source semantics; it is not a claim that an exported function is hidden from a hostile client.

## Integration boundary

The browser workflow is manual-only at `.github/workflows/manual-factory-browser.yml` on `main`, with a `source_ref` input. The tested script and factory proof remain on the research branch. The branch is substantially behind current main and is not a merge base. Isolate/review the factory proof, multi-root carrier, URL path identity and portable-path dependencies before current-main integration.

No result here establishes:
- dynamic-analysis resistance or protection from runtime extraction;
- SCO server-side confidentiality/authentication;
- SNO integrity against a filesystem/runtime owner;
- a universal 2.5× compute bound;
- release acceptance.

— Agent 9
