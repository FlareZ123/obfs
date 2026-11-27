# Canonical five-state no-reset Mealy continuation learner

**Status:** intermediate adversarial evidence, not an established academic result and not a release candidate. This extends the four-state experiment in [`sco-four-state-step-only-2026-11-23.md`](sco-four-state-step-only-2026-11-23.md). It does not establish arbitrary-JavaScript recovery, source recovery, key recovery, or a stronger obfuscator.

## Scope and assumptions

The attacker receives only an asynchronous public `step(symbol)` callback. There is no reset endpoint, source disclosure, state label, transition-table access, or private evaluator handle. The oracle is assumed to be a stationary deterministic binary Mealy machine with a fixed initial state and at most five reachable states. Each call accepts one binary input and returns one binary output.

A certificate is conditional: every machine in the complete declared model class that agrees with the observed transcript must be future-behaviorally equivalent from its current state. The learner does not establish that the actual oracle satisfies the five-state bound.

## Canonical model-space construction

A five-state labeled binary Mealy machine has (5^{10}2^{10}=10,000,000,000) transition/output tables, too many to enumerate directly. The implementation instead canonicalizes the reachable transition graph.

Starting from initial state 0, assign state labels in first-discovery BFS order, processing input 0 before input 1. For a source state with (k) states already discovered, its two outgoing edges have:

- (k^2) choices that discover no new state;
- (2k+1) choices that discover exactly one new state;
- one choice that discovers two new states.

Dynamic programming over the processed source states gives the number of rooted reachable transition graphs for each exact state count:

| Reachable states | Canonical transition graphs | Output masks per graph | Mealy models |
|---:|---:|---:|---:|
| 1 | 1 | 4 | 4 |
| 2 | 12 | 16 | 192 |
| 3 | 216 | 64 | 13,824 |
| 4 | 5,248 | 256 | 1,343,488 |
| 5 | 160,675 | 1,024 | 164,531,200 |
| **Total through 5** | **166,152** | — | **165,888,708** |

Every rooted reachable transition graph has exactly one such BFS labeling. Unreachable states do not affect behavior from the initial state and are represented by their smaller reachable submachine. All output masks are enumerated independently. Thus the candidate class is complete for future behavior of every deterministic binary Mealy machine with at most five reachable states, modulo rooted state isomorphism.

The generator in `sims/sco-step-only-five-state.js` implements this recursion and checks the exact total. An independent brute-force check by Agent 14 enumerated all 9,765,625 labelled five-state transition graphs, found 3,856,200 reachable from the fixed initial state, and divided by the free `(5-1)! = 24` relabeling action to obtain 160,675 canonical graphs. This independently matches the recurrence; see `im-results/sco-five-state-canonical-count-2026-11-23.md`.

The test now checks that all 160,675 generated five-state transition tables are unique and fully reachable. It also exhaustively enumerates all 65,536 labelled four-state transition graphs, canonicalizes every reachable one, and confirms exact set equality with the 5,248 generated four-state canonical graphs (31,488 reachable labelled graphs). The active candidate ID encodes the canonical graph index and output mask in 28 bits; the current state is packed into the upper three bits of one 32-bit word. A single `Uint32Array(165,888,708)` therefore stores the active version space in **663,554,832 bytes (about 632.8 MiB)**. Canonical transition tables are shared in small `Uint8Array` instances (about 1.6 MiB total). The product-automaton search covers at most 25 state pairs.

The five-state model class is exhaustive; the query policy is adaptive. It first maximizes the immediate binary output split. When all remaining models agree on both immediate outputs, it finds a shortest distinguishing continuation against a reference model and follows its first symbol. If no candidate has a distinguishing continuation, the learner certifies exact future behavior under the declared bound.

## Local experiments

Implementation and tests:

- `sims/sco-step-only-five-state.js`
- `sims/sco-step-only-version-space.js`
- `test/sco-step-only-five-state.test.js`

The workspace was initialized once and reused sequentially for three attacks. Each fixture was a minimal machine: all its states were reachable and partition refinement found exactly the declared number of observable state classes. The attacker had a 128-query cap. Every certificate was checked by an independent disjoint-union fixed-point partition-refinement implementation and 128 held-out continuations of length 1–60.

Local environment: Node v22.16.0, Linux x64, AMD EPYC 9V74, four reported parallelism slots.

| Fixture | True states | Queries | Remaining equivalent candidates | Candidate scans | Equivalence checks | Product pairs | Learner ms |
|---|---:|---:|---:|---:|---:|---:|---:|
| SHA-derived random machine, seed `0x42f5a7c9` | 5 | 31 | 1 | 655,928,183 | 3 | 12 | 4,091.945 |
| Minimal delayed-output chain | 5 | 49 | 4 | 722,453,014 | 10 | 65 | 4,378.516 |
| SHA-derived random machine, seed `0x1f3a995b` | 4 | 31 | 3,646 | 686,821,210 | 4,133 | 4,589 | 3,946.382 |

Workspace initialization, including canonical transition generation, candidate-array allocation and initial ID fill, took **649.041 ms**. The candidate array occupied **663,554,832 bytes**. The three learner calls took 12,416.843 ms total after workspace initialization. All **384 held-out traces** matched exactly.

### Storage/performance alternative

An exploratory bitset implementation is preserved at `workplace/sco-five-state-bitset-benchmark.js`. It replaces the 4-byte active candidate-ID array with a `Uint32Array` membership bitset (20,736,092 bytes) plus a `Uint8Array` current-state array (165,888,708 bytes), for **186,624,800 bytes total**—about 3.56× less candidate storage. It reuses the same canonical transition tables, query policy, and three fixtures. A local prototype run measured workspace initialization 449.66 ms and learner times 5,334.22 ms, 6,538.68 ms, and 5,318.17 ms; query counts, remaining candidates, scan counts, and 384 held-out traces matched the active-ID implementation under an independent product-BFS comparison. Peak process RSS was 223,092,736 bytes. The preserved script additionally contains a disjoint-union partition-refinement check, but that exact workplace harness has not been run in CI. This is approximately 1.38× slower in aggregate than the default active-ID representation, but substantially more memory efficient. The default learner keeps the faster active-ID array; the bitset prototype is exploratory and is not part of CI.

A better memory/time compromise is preserved in `workplace/sco-five-state-blocklist-benchmark.js`. It stores one byte per candidate in fixed 32-candidate blocks (five local-ID bits plus three current-state bits) and keeps a sorted `Uint32Array` of nonempty block IDs and active counts. Candidate storage remains **186,624,800 bytes**, but block-local in-place compaction avoids per-candidate bit extraction. The local prototype produced the same query counts, remaining candidates, scan counts and 384 held-out traces under independent product BFS. Workspace initialization was 643 ms; learner times were 4,528.20 / 4,962.46 / 4,341.49 ms; peak RSS was 227,221,504 bytes. Aggregate learner time is about **1.11×** the default active-ID implementation while using about **3.56× less candidate storage**. The preserved workplace harness additionally asserts disjoint-union partition refinement; it is exploratory and not in CI. The current default remains the faster active-ID list pending a decision whether the lower-memory representation is worth an ~11% local runtime penalty.

For the random five-state fixture, the learner isolated one canonical candidate in 31 binary-output queries. The raw model-count information lower bound is ceil(log2(165,888,708)) = 28 binary outputs; this is only a coarse bound because behaviorally equivalent hypotheses need not be distinguished.
## Live authenticated RPC matched control

The five-state learner was also exercised through the existing local authenticated HTTP harness, not only an in-process callback. `runLiveStepVersionSpace(5, 0x42f5a7c9, true)` runs the generated SCO endpoint and a conventional esbuild-minified Node service backed by the same five-state machine. It reuses one five-state workspace sequentially for both arms.

The live test asserts identical attacker input/output transcripts and query counts (31 per arm for this deterministic fixture), exact continuation clones, matching 16-symbol live followups, no public reset, no generated source canary disclosure, and HTTP 403 from both unauthorized endpoints. The workspace/candidate representation is checked at 663,554,832 bytes. This is a local HTTP integration control; it is not a WAN/TLS or production deployment test.

Cross-platform CI: [manual SCO run 45106569967](https://github.com/FlareZ123/obfs/actions/runs/45106569967), source head `29e51bcee0a7046c51879ea5933beec6e1f91cb3`, passed on Ubuntu and Windows. The run includes the live five-state generated-SCO vs ordinary minified matched control, offline five-state learner, exhaustive generator checks, four-state matched control, and strict SCO JSDoc. The workflow display label was subsequently updated to say “two through five-state”; that label-only change does not alter the tested code.


## Why the state bound is essential

The five-state delayed-output chain is the same kind of negative control used in the four-state experiment: input 0 advances along five states, input 1 returns to state 0, and output 1 appears only on input 0 from state 3.

- Under the incorrect four-state bound, the four-state learner falsely certifies after 45 queries; the full distinguishing suffix is `[0,0,0,0,0]`.
- Under the correct five-state bound, the canonical learner certifies after 49 queries and its clone passes independent equivalence and held-out checks.

This is not a bug in the conditional certificate: the four-state premise was false. The state bound must be independently trusted.

More generally, no finite membership-query transcript can certify exact equivalence against *all* finite-state machines when no state bound is known. For any finite set of queried words, take its finite prefix tree. Construct another Mealy machine with one state per queried prefix plus a sink: on transitions that remain within the prefix tree, reproduce the target's observed output and move to the corresponding prefix state; on an unqueried extension, emit the opposite output and enter the sink. It matches every queried word and differs on an unqueried extension. In the no-reset single-trace case, a chain with (T+2) states can match (T) observed steps and diverge on the next step. This is a standard membership-query limitation, not a novelty claim.

## Enumerative scaling boundary

Applying the same canonical recurrence to exactly six reachable states gives 5,931,540 transition graphs and (2^{12}) output masks, or **24,295,587,840** six-state models. The total model class through six states is 24,461,476,548 models, requiring 35 bits just to identify a candidate. A packed five-byte ID array would require 122,307,382,740 bytes (about 113.9 GiB); a conventional eight-byte ID array would require 195,691,812,384 bytes (about 182.3 GiB), before any auxiliary structures. Even a hypothetical four-byte-per-candidate lower bound is 97,845,906,192 bytes (about 91.2 GiB), but four bytes cannot encode all 24.46 billion IDs.

This is a practical limit of this exhaustive representation, not a security threshold. It does not show that six-state behavior is safe. A concrete but unimplemented SAT/SMT direction is sketched in `workplace/sco-step-only-sat-bounded-equivalence.md`: ask whether two transcript-consistent N-state Mealy machines can differ within an N²-step product witness. This is a design proposal only; no solver is installed or benchmarked.

## CI and reproduction

The existing dispatch-only manual workflow was extended; no new workflow was created.

- [Manual SCO authorized oracle run 45106569967](https://github.com/FlareZ123/obfs/actions/runs/45106569967)
- Source head: `29e51bcee0a7046c51879ea5933beec6e1f91cb3`
- Ubuntu and Windows jobs succeeded, including the live five-state generated-SCO vs ordinary minified matched control, uniqueness/reachability checks for all 160,675 generated five-state graphs, exhaustive canonical-set comparison of all 65,536 labelled four-state graphs, offline five-state learner, four-state matched control, and strict SCO JSDoc checks.
- Earlier runs 45105195468 and 45105822873 were green before the live five-state RPC extension.
- The five-state test enforces a 128-query cap and a 15-second per-fixture learner-time cap. The reusable workspace is allocated once per test and reused sequentially.

Reproduction:

```sh
node --test test/sco-step-only-five-state.test.js
node --test test/sco-step-only-version-space.test.js
node --test test/sco-step-only-live-rpc.test.js
npx tsc -p jsconfig.sco-oracles.json
```

## Limitations and interpretation

- The five-state experiment includes both offline callback tests and the live local-HTTP generated-SCO versus esbuild-minified ordinary-service matched control described above. The linked four-state report contains the earlier four-state live experiment.
- The oracle must be deterministic, binary, stationary, and have a fixed initial state. Shared server state, sessions, time, concurrency, nondeterminism, or external dependencies can violate this model.
- The candidate array and query learner are attacker-side costs. No target-side runtime measurement or 2.5× budget evaluation was performed.
- No browser, WAN/TLS, real domain lock, production identity proof, arbitrary-JavaScript reconstruction, source recovery, or key extraction was tested.
- The six-state enumeration limit is not a security claim.

Keep this report in `im-results/`. The global release decision remains **RELEASE-BLOCKED** until a mode-specific candidate demonstrates a security advantage against matched equal-trust controls and independently passes performance and compatibility gates.


## 26 November 2026: process-isolation qualification

The earlier phrase “the attacker receives only an asynchronous public `step(symbol)` callback” describes only the **arguments passed to the fixed learner function**. It does not describe an OS/process isolation boundary.

The live HTTP harness in `sims/sco-step-only-live-rpc.js` runs the SCO server, private module, evaluator and learner in the same Node process and under the same UID. It writes the private module to `root/private/actual.mjs` under a temporary directory created by `fs.mkdtemp`. Mode 0700 prevents access by a different UID, not by hostile code running under the same UID. A malicious learner could enumerate `os.tmpdir()`, find the `obfs-step-version-space-*` directory, and read the private source (including `privateTable` and the canary). It could also use same-process runtime instrumentation. The conventional control is in the same process too.

Accordingly, this experiment remains valid as a **fixed-algorithm, in-process query-complexity / HTTP API-contract simulation**: the tested learner implementation itself is passed only the public step API, and its recorded queries, transcripts, clones and model-theoretic certificates remain as measured. It does **not** establish that a hostile client with filesystem/DevTools control is unable to inspect the server's private source or state. The prior scope language should not be interpreted as that stronger claim.

A genuine SCO hostile-client test needs the server and learner in separate processes, preferably distinct UIDs or a restricted container. The learner must have no sudo rights, no access to the parent's files/process memory/private temp root, and only the public client/runtime dependencies, session capability and HTTP origin. Keep this report intermediate until that stronger harness is independently validated.
