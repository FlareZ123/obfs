# Runtime-hook extraction of eager decoded strings: 30/30 emitted programs

**Status:** reproducible adversarial engineering evidence, **not** an academic security result. Agent 12, 2026-11-15.

## Threat model and attack

The main encoder in `src/strings.js` stores XOR-encoded strings in client-visible output and reconstructs UTF-16 text eagerly through ambient `String.fromCharCode`. An attacker who controls the JavaScript runtime can install a wrapper around this intrinsic *before* evaluating the delivered program. The wrapper forwards to the original intrinsic and records every plaintext fragment. It needs neither the original source, decoder helper names, array offsets, key, build seed, nor a static decoder parser.

The test source contains a never-called `dormant()` function returning a protected literal, plus a public side effect `globalThis.__obfsPublicResult=37`. In the native source, the runtime hook observes **no** reconstructed fragments because the function is never called. After emitted eager encoding, the same hook observes the dormant literal at program initialization while the public result stays 37. The plaintext sentinel is absent from the transformed source string.

The instrumentation uses Node `vm` only as an *attacker-controlled demonstration realm*. It is not a safe sandbox for untrusted source. A browser/Node adversary allowed to alter or instrument its own runtime can establish an equivalent hook; a follow-up live Chromium test now confirms this mechanism in an actual browser (details below).

## Executable evidence

- Attack helper: `sims/runtime-decoder-trace.js`
- Differential / extraction suite: `test/runtime-decoder-trace.test.js`
- Compiler mode matrix: COO and SCO client **explicitly** request `strings:true`; SNO uses its normal default. Property/identifier passes are disabled to isolate the current string decoder.
- Seeds: ten distinct deterministic seeds per mode, with seed-specific plaintext sentinels.
- Fixtures alternate a short Unicode string containing a supplementary scalar and an isolated surrogate with a long string exceeding the decoder's 1,024-code-unit chunking threshold.
- Every attempt verifies original behavior, active emitted decoder (`metrics.literals >= 1`), absence of the literal in emitted plaintext source, extraction through hook calls, and equivalent public output.

| Validation | SNO | COO opted-in encoding | SCO client opted-in encoding |
|---|---:|---:|---:|
| Ubuntu Node.js 22, dynamic literal extraction | 10/10 | 10/10 | 10/10 |
| Windows Node.js 22, dynamic literal extraction | 10/10 | 10/10 | 10/10 |
| Native dormant function ever invoked | no | no | no |

**Pinned integration head:** `8ab554d7bb612bb3cc07d8f710ce0783b2ebe9ce`.
Manual Linux/Windows run: [GitHub Actions #43695839545](https://github.com/FlareZ123/obfs/actions/runs/43695839545). The three new subtests were **ok 392, 393, 394** on both platforms. JSDoc type checking, benchmark, and Ubuntu live Chromium integration passed. The overall workflow was **red** on five preexisting native source-observer / BigInt-guard failures: tests 58, 90, 91, 403, 404, independent of this runtime decoder attack. Therefore the run is **not** a clean release gate.

## Follow-up real Chromium reproduction

`test/browser-integration.js` now serves an opt-in COO-encoded classic script with an unused `browser-dormant-plaintext-canary` literal. The browser page installs a wrapper around `String.fromCharCode` before loading the obfuscated script, records its plaintext fragments, and renders the recovered string alongside the script's unchanged public result. The protected file itself has no plaintext canary string. Manual Chromium [workflow #43696954625](https://github.com/FlareZ123/obfs/actions/runs/43696954625) passed at head `0f8dcf3e6e75fac3116089e2a3e232d42f47a906`, with the explicit log `Chromium PASS: /trace.html: 37:browser-dormant-plaintext-canary`. This is one real-browser proof of concept, separate from the 30 per-mode seeds checked on Node/Windows/Linux.

## Independent security dimensions

- **Static reconstruction:** already broken for the current XOR emitter by `sims/static-string-recovery.js`. This new experiment specifically demonstrates source-agnostic *runtime* plaintext recovery.
- **Dynamic extraction:** successful for the current intrinsic-based eager decoder in all tested seeds and modes. The attacker observes dormant literal reconstruction even when business logic never uses the value.
- **Tamper/authorization:** the attacker modifies only its local execution realm. No SCO server compromise, source exposure, authorization bypass, or remote endpoint modification is claimed.
- **Compatibility:** original and hooked emitted programs produced the same public output in every fixture. This corpus does not establish general semantic equivalence.
- **Performance:** decoder tracing is attacker overhead, not normal application overhead. No new protected-work 2.5x measurement is claimed. Default COO/SCO eager encoding remains off; this attack probes explicit opt-in for those client files.

## Decision and limits

Treat eager client-side literal encoding as superficial static friction, **not** runtime confidentiality. Do not place sensitive authorization secrets in COO, SNO owner-controlled, or SCO client-delivered JavaScript expecting this decoder to keep them private. Keep privileged operations and secrets on a trusted SCO server when feasible, with real operation-level authorization and measured end-to-end latency. The trace targets `String.fromCharCode`; other decoders could require different hooks. Generic debugger access and full client control are broader than this single test. SCO truly private server-side functions are outside this attack's reach, while unlimited legitimate oracle queries retain their separate black-box extraction limits.
