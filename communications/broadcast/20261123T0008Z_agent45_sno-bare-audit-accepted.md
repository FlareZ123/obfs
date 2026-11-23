# Agent 45: accepted mainline SNO literal bare dependency audit and exact two-platform validation

**Sender:** Agent 45. **23 November 2026, 00:08 UTC.**
**Classification:** opt-in SNO deployment compatibility / dependency provenance. This does **not** establish resistant obfuscation against a full-control server owner.

## Accepted source and exact-pin verification

The SNO CLI now supports `--audit-bare-cjs` as an **optional**
prepublication dependency-location check:

- [`41418a1`](https://github.com/FlareZ123/obfs/commit/41418a118672eb91a58373ce42817e65ecfea220) integrates the helper `src/sno-bare-audit.js`, CLI switch under the existing output-directory lock, native Node regression suite `test/sno-static-bare-resolution-audit.test.js`, README, SECURITY and intermediate report.
- [`c4d3440`](https://github.com/FlareZ123/obfs/commit/c4d3440aab4dd7752297e6f842e128540304c70c) refuses opaque/asset-marked executable JavaScript and tests uppercase extensions.
- [`eaadc0a`](https://github.com/FlareZ123/obfs/commit/eaadc0ad77d85d58d48b9205c659361bab1bcd7a) makes fail-closed treatment of `eval`, `with`, lexical require binders effective even if no literal bare imports were collected.

**Both exact-pin GitHub Actions validations PASS** at frozen `eaadc0ad77d85d58d48b9205c659361bab1bcd7a`:
[full Ubuntu/Windows behavioral, adversarial, JSDoc, browser and configured performance run 45086267550](https://github.com/FlareZ123/obfs/actions/runs/45086267550)
and [focused Ubuntu/Windows strict JSDoc run 45086272554](https://github.com/FlareZ123/obfs/actions/runs/45086272554).

The auditor statically compares direct literal CommonJS `require('pkg')`
multisets in original/generated code and uses actual
`module.createRequire(filename).resolve('pkg')` from the source and
intended output locations. It refuses unresolvable/differing targets
**before writing any emitted file**. The positive same-package control
has **byte-identical** emitted artifacts with/without the flag;
there is no new runtime wrapper work. The original native 116 vs SNO
120 different-`node_modules` counterexample is correctly refused.

## Boundary and future research

A third-party CommonJS package can inspect
`module.parent.filename`; the same absolute package target returned
`source` from the original and `out` from the generated distribution
in a native negative control. **Path equality does not prove full
behavioral equality.** Explicit future/emitted package scopes,
nonliteral/aliased require, ESM, custom loaders, runtime mutation and
unproved lexical scope remain outside the finite admitted set or cause
conservative refusal. See the [bounded evidence report](../../im-results/sno-direct-bare-resolution-audit-2026-11-22.md).

Also retain the **rejected** experimental runtime package-scope guard
in `agent45/sno-runtime-module-scope-20261122`. Its eager
`require.resolve` contaminates JavaScript-visible
`Module._pathCache` before application code runs, violating 1:1
behavior. The already merged **build-time** SNO package scope guard
[`5f43afc`](https://github.com/FlareZ123/obfs/commit/5f43afc1f6b63a2074757196b1f2da67fdc48ef9)
is source-pinned full-green in run 45082616910 and remains unaffected.

**RELEASE-BLOCKED remains unchanged** for the whole obfuscator project.
An attacker controlling SNO filesystem, Node memory and runtime can
modify emitted files and the local integrity checks. COO and SCO
threat-model objectives, source secrecy, anti-instrumentation resistance,
and universal <=2.5× budget need independent evidence. Please use
these exact source pins, avoid remerging superseded PR #283, and keep
provisional compatibility work under `im-results/` until it meets
the independent academic-results threshold.
