# Decoder-sensitive Proxy get traps: bounded red/green provenance repair (2026-11-21)

## Scope and release decision

This record is a **compiler-correctness** investigation of the cross-file eager
long-string decoder in `src/core.js::mutatesDecoderIntrinsic`. It is not a
security result and does not change `results/README.md`'s **RELEASE-BLOCKED**
decision. The tested clients run a native JavaScript graph or its actual
COO/SNO obfuscated output in Node 22 subprocesses. For each negative, the
`target.cjs` string is long enough to select the eager decoder unless the
analysis rejects it. Each negative requires output parity and zero encoded
target literals; matched `Number.prototype` controls require parity **and one
encoded literal**, so a trivial always-refuse fix is disallowed.

The prior incarnation left a clean red [original
16-case run](https://github.com/FlareZ123/obfs/actions/runs/44484391108)
with eight wrong-output `String.prototype` cases (four handler forms
times COO/SNO) and eight transformed `Number.prototype` controls.

## Reproduction and tests

A first repair introduced finite get-handler provenance with a fixed-point
summary across handler aliases, local handler-producing functions, and
single-reference getter returns. A new 32-case gate initially uncovered
two additional named-trap misses; a focused patch resolved them:

- [Initial partial red](https://github.com/FlareZ123/obfs/actions/runs/44874997400):
  30 pass / 2 fail on the Ubuntu 32-case suite; named get traps were missed.
- [First corrected 32-case green](https://github.com/FlareZ123/obfs/actions/runs/44875069620):
  both Ubuntu and Windows passed, including typecheck.
- [Expanded 48-case green](https://github.com/FlareZ123/obfs/actions/runs/44875188402):
  both Ubuntu and Windows passed. New cases covered Proxy constructor
  aliases, detached revocable factory aliases, assigned handlers and
  aliased get-trap callables.
- [Further red](https://github.com/FlareZ123/obfs/actions/runs/44875269684)
  at `e4582811d3047a4dcc774d667e37179c1772095d`: 64 pass / 16
  fail among 80 cases on Ubuntu. All 16 failed cases were the newly added
  decoder-sensitive mutation cases, while all matched safe controls passed.
  The missed writes used direct `handler.get` assignment, alias
  assignment, `Reflect.set`, `Object.assign`, `Object.defineProperty`,
  `Object.defineProperties`, accessor-produced callable traps, and
  computed `handler[key]` mutation.
- [80-case green](https://github.com/FlareZ123/obfs/actions/runs/44875373770)
  at `e3784a44c0bf511202c04ff7a9a67cee239b3ace`: all **80/80**
  dedicated COO/SNO cases passed on **both Ubuntu and Windows**. Both
  platforms also passed the neighboring source-coercion regressions and
  production JSDoc checker.

## Implementation

`src/core.js` now analyzes finite handler literals, getter function
returns, named/aliased traps, known local handler factories, direct and
revocable Proxy construction, plus selected post-construction handler
mutations. The analysis conservatively refuses the eager decoder when it
finds an intrinsic-sensitive Proxy with a reachable get trap. A finite
`Number.prototype` trap remains eligible and the positive encoded-string
metric verifies this. The regression lives in
`test/decoder-proxy-get.test.js`; the default-existing,
**manually-dispatched** `.github/workflows/manual-array-source-coercion.yml`
runs it on Linux and Windows. No per-commit workflow is added.

## Limitations and follow-up

This is a finite static provenance model. Opaque imported factories,
dynamic computed handlers, mutator closures, host-injected proxies,
setter/function dispatch, and hostile runtime instrumentation remain
unproved. Eager decoding can still be unsafe for other intrinsic mutations
the analyzer does not recognize. Cross-file tests here exercise a
three-file input with mutator dependency execution preceding target load,
without proving arbitrary interprocedural equivalence.

Passing test pairs establishes correctness **for the pinned source and
inputs only**. There is no universal 2.5x compute guarantee or evidence of
source confidentiality, tamper resistance, or security against a runtime
owner from these checks. Broader real-browser and whole-application
adversarial gates remain separate release obligations.
