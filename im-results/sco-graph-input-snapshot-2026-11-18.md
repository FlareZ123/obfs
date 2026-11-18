# SCO graph input snapshots: public facade selection must match reviewed source records

**Date:** 2026-11-18 UTC  
**Owner:** Agent 18, normal research  
**Scope:** `partitionScoAsyncGraph` compiler initialization, with cross-platform Node 22 differential tests and real HTTP publication check.

## Admission mismatch

The compiler originally evaluated `options.exposedPaths` repeatedly during `Array.isArray`, `.length`, `.some` validation, and a later `for...of` selection loop. A getter returning `['public.mjs']` for the validation reads and `['admin.mjs']` for selection could cause the emitted manifest to select the administrative module, even though the preceding validation observed only the public name.

A second input supplied `exposedPaths=['public.mjs']` with an own custom `Symbol.iterator` yielding `'admin.mjs'`. The ordinary `.some` check inspected the public element while the `for...of` selection consumed the forged iterator. This exposed a gap between data validated for publication and the file names selected for generated RPC facades. A trusted integrator with indiscriminate operation authorization could turn such drift into unintended exposure of private operations.

The original implementation also consumed the `files` array through an overridable iterator, read each `file.code` getter more than once, read `seed` multiple times, and read `endpoint` separately for every selected module. These were adjacent source/option provenance risks rather than evidence of a client-only attack.

## Reproducible red/green controls

The regression suite is in `test/sco-graph-private-path-policy.test.js`.

- **Red control:** [workflow 44281021119](https://github.com/FlareZ123/obfs/actions/runs/44281021119) at [commit 3c6757a](https://github.com/FlareZ123/obfs/commit/3c6757ad5baa200626de6181ff45f84c9c06ad0a), before the compiler correction. Ubuntu and Windows both reported **two new test failures**: the exposedPaths getter was read more than once, and a forged iterator changed `graph.exposedPaths`.
- **Green control:** [workflow 44281262969](https://github.com/FlareZ123/obfs/actions/runs/44281262969) at exact [commit 5188ae6](https://github.com/FlareZ123/obfs/commit/5188ae6f9da7996a12fc9a1d7b23b050727776ce), after source patch [828949f](https://github.com/FlareZ123/obfs/commit/828949fe7f624dd2fa3594ce5b72b7968fc9392c). Both Ubuntu and Windows jobs passed. Ubuntu reports **19/19 SCO graph tests** and zero failures, plus the generated-graph fixture check and strict JSDoc. The Windows job also succeeded.

The green HTTP regression observes `200` for the reviewed public facade, `404` for the unapproved administrative module source, and the expected authorized RPC result. Additional tests verify that a forged files-array iterator is ignored, source getter bytes are used once, and changing seed/endpoint getters are each consulted once across two exposed modules.

## Implementation

`partitionScoAsyncGraph` now:

1. Reads `options.exposedPaths`, `options.seed`, and `options.endpoint` once during construction.
2. Captures the approved exposed path count and each indexed path value once into a compiler-owned string list. This avoids caller-overridden `.some` and `Symbol.iterator` methods.
3. Reads each input file by numeric index. It captures the source string and declared source type once, then constructs a compiler-owned module record.
4. Uses the captured approval list, seed, and endpoint throughout facade selection and generation.

This is an admission-consistency change. Runtime generated facade code and per-request handler behavior are unchanged.

## Security and performance interpretation

The evidence establishes rejection of specific changing-configuration attacks on compiler input provenance, with a real authorized HTTP output check after the fix. It does not establish secrecy against a server compromise, prevent a trusted integrator from deliberately approving `admin.mjs`, defeat unlimited authorized online relaying, or prove general resistance to runtime extraction.

The work occurs at server-controlled graph initialization and should be evaluated under the prompt's SCO initialization allowance. No measured universal 2.5× performance claim is made. A full repository integration gate is separate from the targeted pin.

Independent future checks should examine similar array iterator assumptions in adjacent selected-SCO graph compilation, and verify package-level publication authorization independently of dynamically supplied compiler configuration.

## Extension: selected-SCO unit inventory

The adjacent `src/sco-selected-graph.js::partitionScoSelectedGraph(units)`
had a homologous admission mismatch. Its caller-supplied `units` array was
validated by `Array.isArray` and `.length`, then consumed through
`for(const unit of units)`. A caller-supplied `Symbol.iterator` could
instead yield an unapproved module and generate its public facade, despite the
indexed array specifying an approved module.

The new test in `test/sco-selected-graph.test.js` supplies an indexed
`approved.mjs` containing a protected `secret` operation and overrides the
array iterator to produce an `admin.mjs` module instead. Its post-fix real
HTTP assertions require a successful GET of `approved.mjs`, `404` for
`admin.mjs`, and parity of an authorized RPC call.

- **Pre-fix red:** [workflow 44284255249](https://github.com/FlareZ123/obfs/actions/runs/44284255249) at [commit 4de129f](https://github.com/FlareZ123/obfs/commit/4de129f83aadc37e1d2290790ccd6e84fdff231d) failed only the new selected-graph public-inventory regression on both operating systems, due to `graph.exposedPaths` containing the iterator-supplied module rather than the reviewed array member.
- **Post-fix green:** [workflow 44284423649](https://github.com/FlareZ123/obfs/actions/runs/44284423649) at exact [commit 3d20f30](https://github.com/FlareZ123/obfs/commit/3d20f3057b1eecfba92a5404c46068c24f92b454) succeeded on both OSes. The patch snapshots the `units.length` count once and reads numeric indexes, avoiding custom iterators.
- Targeted `manual-sco-graph.yml` now includes `test/sco-selected-graph.test.js` in its Linux/Windows test command, so future graph regressions exercise both compilers.

The selected graph's one-read file/source fields and strict original digest provenance remain governed by their prior tests. This correction addresses only the direct unit-array iterator boundary, without pretending to authenticate the integrator's own choice of modules.
