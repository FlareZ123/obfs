# Compact four-state no-reset Mealy continuation learner

**Status:** intermediate adversarial evidence, not an established academic result and not a release candidate. Stored in `im-results/` deliberately. It does not establish arbitrary-JavaScript recovery, source recovery, key recovery, or a stronger obfuscator.

Subsequent extension: [canonical five-state no-reset learner](sco-five-state-step-only-2026-11-23.md), which adds a complete reachable model class through five states, a live five-state generated-SCO vs ordinary esbuild-minified matched control, and a six-state enumerative scaling analysis.

## Question

Can an authorized caller reconstruct the *future observable behavior* of a small stateful SCO operation without a reset endpoint, without private-state access, and without reading the server's private source?

The attacker is given only an asynchronous public `step(symbol)` callback. The model class is deterministic binary Mealy machines, with binary inputs and outputs, a fixed initial state 0, and a declared upper bound of four states. No reset, state label, transition table, private source, or test-oracle handle is passed to the learner.

## Method

`sims/sco-step-only-four-state.js` represents the complete four-state model class as (2^{24}=16,777,216) packed machines:

- Low 16 bits: eight two-bit successor-state values (four states × two inputs).
- High 8 bits: eight one-bit output values.
- The current state of each hypothesis occupies two additional bits in a `Uint32Array` entry.
- The full active version space is a 64 MiB `Uint32Array`; inconsistent hypotheses are removed in place, rather than materialized as millions of JavaScript objects.

The query policy first chooses the input with the most balanced immediate output split. If all surviving models agree on both immediate outputs, it searches the product of the reference model and each other candidate (at most 16 state pairs) and follows the first symbol of a shortest distinguishing continuation. If every remaining candidate is continuation-equivalent to the reference from its current state, the learner returns a certificate.

The four-state model class contains every machine with at most four reachable states: smaller machines are embedded by padding unreachable states. The object-based enumerator in `sims/sco-step-only-version-space.js` remains limited to one through three states; `learnBoundedStepOnly(..., 4, ...)` dispatches to the packed implementation.

A positive certificate means: *assuming the true oracle is a deterministic binary Mealy machine with at most four states and the modeled initial state, every model in the complete declared version space consistent with the observed transcript has identical future output behavior from its current state.* It does not claim that the hidden transition table or source has been recovered.

## Offline experiment

Implementation and tests:

- `sims/sco-step-only-four-state.js`
- `sims/sco-step-only-version-space.js`
- `test/sco-step-only-version-space.test.js`

The experiment used eight SHA-256-derived four-state machines: four base seeds and four independent holdout seeds. The hidden machine was kept in the evaluator closure; the learner received only `step`. Each successful certificate was checked by a separate disjoint-union fixed-point partition-refinement implementation and by 128 held-out continuations of length 1–60. All 1,024 held-out sequences matched exactly.

Local runtime: Node v22.16.0, Linux x64, AMD EPYC 9V74, four reported parallelism slots. Times below are attacker-side learner wall time, including version-space allocation and filtering but not an HTTP round trip.

| Corpus | Seed | Queries | Remaining equivalent hypotheses | Candidate scans | Equivalence checks | Product pairs | Local ms |
|---|---:|---:|---:|---:|---:|---:|---:|
| base | `0xa82b11f5` | 27 | 972 | 72,377,804 | 1,907 | 3,880 | 474.755 |
| base | `0xa82b2562` | 28 | 21,864 | 68,345,932 | 21,863 | 49,930 | 372.531 |
| base | `0xa82b38cf` | 31 | 804 | 67,117,444 | 3,380 | 3,454 | 290.960 |
| base | `0xa82b4c3c` | 52 | 25,512 | 70,158,148 | 140,654 | 311,977 | 281.205 |
| holdout | `0x51a9c603` | 58 | 647,704 | 141,505,880 | 3,601,662 | 5,600,101 | 697.260 |
| holdout | `0x51a9e716` | 26 | 480 | 64,633,964 | 591 | 1,824 | 216.148 |
| holdout | `0x51aa0829` | 24 | 102 | 65,984,906 | 105 | 325 | 212.442 |
| holdout | `0x51aa293c` | 25 | 6 | 67,987,486 | 5 | 20 | 217.949 |

Across the eight models: 24–58 queries (mean 33.875), maximum measured local time 697.260 ms, 618,111,564 candidate scans, 3,770,167 equivalence checks, and 5,971,511 product pairs. A separate test compared the packed shortest-witness first-symbol routine against the existing object-model product BFS on 100,000 seeded random model pairs; all comparisons agreed.

One- and two-state exhaustive controls and separate two-/three-state fixtures also certified under the four-state padded model class.

The current test source additionally caps each four-state offline run at five seconds and logs the full record set. That final test-only cap/log edit was committed after the cross-platform run pinned below; its underlying eight-model timings were measured locally as shown above.

## Deliberate model-bound failure

The upper bound is an assumption, not a property proved by the learner.

A five-state minimal delayed-output machine was constructed with transitions `0 --0--> 1 --0--> 2 --0--> 3 --0--> 4`, input 1 returning to state 0, and output 1 only on input 0 at state 3. Independent partition refinement found five observable state classes. When incorrectly told the bound was four, the learner nevertheless certified after 45 queries with 18 four-state hypotheses remaining. The full product search then found the held-out distinguishing suffix:

`[0, 0, 0, 0, 0]`

This is a real false certificate under a violated premise. The result must never be presented as unconditional reconstruction. Without a trusted state bound, a finite transcript cannot exclude a larger machine that delays divergence beyond the observed transcript.

## Real SCO and matched ordinary control

`sims/sco-step-only-live-rpc.js` and `test/sco-step-only-live-rpc.test.js` exercise the attack through a real compiler-generated authenticated SCO HTTP facade. The private module and canary remain server-side; the published ESM facade exposes only `step`, has no reset export, and unauthenticated RPC receives HTTP 403.

The four-state case also runs the same attacker against a matched conventional Node HTTP service. Both services use the same private four-state machine, initial state, cookie authorization policy, and public step semantics. The conventional client is an ESM stub minified with esbuild. The attacker sees only each public `step` method. Both arms produce identical input and output query transcripts, equal query counts, exact continuation clones, and matching 16-symbol live followups; the ordinary endpoint also returns HTTP 403 without the cookie.

This is a matched equal-trust transport/control experiment, not a WAN/TLS/browser benchmark. It does not test stronger identity proofs, real domain locking, cross-tenant shared-state races, or production session security.

## CI and reproducibility

The existing dispatch-only workflow was reused; no new workflow was created.

- [Manual SCO authorized oracle run 45103824383](https://github.com/FlareZ123/obfs/actions/runs/45103824383)
- Tested main source: `1de4a10d58d735576b89542049ab3f02bdcc2a97`
- Ubuntu and Windows jobs succeeded, including the four-state offline tests, real generated SCO RPC, matched ordinary minified control, and strict SCO JSDoc checks.
- An earlier run failed because the negative-control assertion expected only the first distinguishing symbol; the product search correctly returned the full five-symbol witness. The assertion was corrected, and the subsequent pinned cross-platform run passed.
- The later five-second test assertion and record logging are test-only changes after the pinned green run; they do not change the learner implementation.

Reproduction commands:

```sh
node --test test/sco-step-only-version-space.test.js
node --test test/sco-step-only-live-rpc.test.js
npx tsc -p jsconfig.sco-oracles.json
```

## Interpretation

This shows that a small, deterministic, low-entropy stateful SCO API can be behaviorally cloned from a modest number of legitimate calls even without a reset endpoint, if the attacker knows a correct small state bound. The matched conventional service yields the same result, so the generated facade provides no observed incremental resistance in this experiment.

The 64 MiB enumeration and sub-second local timings are attacker-side costs, not target-side execution measurements. No claim is made about the 2.5× target runtime constraint. The experiment does not demonstrate arbitrary code deobfuscation, source reconstruction, key extraction, browser compatibility, or improved SCO protection. Keep the overall release decision **RELEASE-BLOCKED** until a candidate demonstrates a mode-specific security advantage against matched controls and independently passes performance and compatibility gates.


## 26 November 2026: process-isolation qualification

The statement that the fixed learner is given only a public `step(symbol)` callback refers to its function arguments, not an OS/process boundary. The live HTTP harness in `sims/sco-step-only-live-rpc.js` runs the SCO server, private module, evaluator and learner in the same Node process and UID. Its private module is written under a mode-0700 temporary directory owned by that same UID. Hostile code running as the learner could enumerate the temp directory and read `private/actual.mjs`; same-process runtime instrumentation is also outside the test's controls.

The measured four-state query counts, semantic transcripts, continuation clones and conditional model-theoretic statements remain valid for the fixed learner implementation. The harness does not establish resistance to a hostile client with filesystem/DevTools access. A real SCO attacker-boundary test requires a separate server process and a separate no-sudo client UID/container with no access to server files or memory. This is an intermediate in-process query-complexity/API test, not a process-isolated security experiment.
