# Public step-only finite-state continuation learner (16 November 2026)

**Status:** intermediate adversarial research. The implementation and reproducible tests ran successfully in the local Node.js 22.16.0 environment. The manual Linux/Windows SCO oracle workflow was extended for cross-platform verification. An independently pinned workflow run is required before claiming cross-platform success for this new algorithm.

## Research question

The earlier stateful SCO attacks searched for a short synchronizing word and then invoked an assumed reset-aware learner. Even when source and key material remained server-only, an online authorized attacker could query the exposed step function. Finding an actual global reset word is difficult and can be impossible. We therefore ask a narrower, actionable question: **can the attacker certify the continuation behavior of a live, nonresettable private state machine without finding any reset word?**

## Version-space method

The attacker in [sims/sco-step-only-version-space.js](../sims/sco-step-only-version-space.js) is given only a legitimate asynchronous `step(symbol)` call, binary inputs/outputs, a bound `maxStates`, and a finite query budget. It has neither a private transition table nor a reset endpoint. It enumerates all labeled deterministic binary-input, binary-output Mealy machines of 1 through `maxStates` states, each from initial state label 0. Relabeling any actual initial state to 0 is without loss of generality. For `maxStates=2`, the version space contains 4+256=**260** machines; for `maxStates=3`, it contains 4+256+46,656=**46,916** machines.

After each public step call the attacker removes hypotheses that would have produced a different output and advances every remaining hypothesis's current state. It chooses a next input by maximizing the immediate split in binary outputs. When immediate outputs are unanimous, it uses a shortest product-machine distinguishing suffix between a reference model and one non-equivalent hypothesis to select the next symbol. This finite deterministic strategy can fail to certify within a query budget, and no reset is assumed.

The **conditional certificate** has a precise meaning: the attacker applies a breadth-first product-state equivalence check between a reference hypothesis and *every* surviving hypothesis from their current states. If all pairwise checks find no output-distinguishing input word, every machine consistent with the entire public transcript and within the declared bound has identical output behavior on **every future input string from its present state**.

This certificate is mathematically sound when the true private machine is deterministic, has binary input/output, started in the modeled initial state (up to renaming), has at most the declared number of hidden states, and produced every recorded output through the modeled `step` operation. The proof is by inclusion of the true machine in the initially complete version space, preservation of that member through every matching observation, and deterministic Mealy observational equivalence computed by exhaustive reachable product-state search. It does not reveal the actual hidden state, private source, key, or outputs before the reconnaissance transcript, and it gives no guarantee if the asserted state-count or system assumptions are false.

## Reproduction

All software is CommonJS with JSDoc and requires Node.js 22. The new source is included in strict `jsconfig.sco-oracles.json`.

- `node --test test/sco-step-only-version-space.test.js`
- `node sims/sco-step-only-version-space-report.js`
- `node sims/sco-step-only-version-space-report.js --holdout`
- `npx tsc -p jsconfig.sco-oracles.json`
- `node --test test/sco-sync-independent-distribution.test.js test/sco-sync-independent-ground-truth.test.js`

The attacker receives only a callback with no reset method. The evaluator records the actual private current state separately, then checks the emitted representative against that model via an **independent product-automaton equivalence check** after all attacker calls. The test also checks all 510 binary continuations of lengths 1–8 as independent held-out inputs, and verifies public-query accounting.

## Exact local results

| Private test family | Machines evaluated | Continuation certificates | False certificates (private evaluator) | Maximum public queries | Total public queries |
|---|---:|---:|---:|---:|---:|
| Exhaustive labeled 1–2-state binary models | 260 | 260 | 0 | 9 | 1,992 |
| Independent SHA three-state base stream | 100 | 100 | 0 | 27 | 1,665 |
| Independent SHA three-state holdout stream | 100 | 100 | 0 | 29 | 1,718 |

The base stream uses public SHA seed `0xa82b11f5 + index * 4973`, and the holdout uses `0x51a9c603 + index * 8467`; arithmetic is interpreted as unsigned 32-bit. Both use the separately implemented SHA-256 machine fixture in [sco-sync-independent-distribution.js](../sims/sco-sync-independent-distribution.js). These are finite, reproducible samples. The version space also retains multiple private-table hypotheses after certification (up to 3,019 in these sampled three-state cases), illustrating that behavioral reconstruction need not identify the true table.

The six-test suite covers exact machine counts, model-pair distinguishing suffixes, exhaustive one/two-state checks, 24 SHA three-state checks with held-out continuations, explicit insufficient-budget refusal, and a **negative control** that falsifies an understated model-size assumption. On the private three-state fixture generated from seed `1`, telling the attacker that the bound is **two** causes it to certify a wrong representative after eight calls. A one-symbol future input `[0]` distinguishes that representative from the actual private continuation. This counterexample shows why the bound is indispensable and why unqualified certification claims would be unsound.

## Actual authenticated SCO facade and server-private source

The focused dispatch-only Ubuntu/Windows [manual SCO oracle workflow 43823735288](https://github.com/FlareZ123/obfs/actions/runs/43823735288) **passed on both platforms** at exact source `2f03cdc8f0369b77d1d99b62cc76d4080ffd0090`. This pinned source includes the initial [real HTTP integration](../sims/sco-step-only-live-rpc.js) and [three-case test](../test/sco-step-only-live-rpc.test.js), in addition to the six-test offline exhaustive/sampled learner, strict JSDoc, earlier independent SHA machine/challenge cases, and the existing SCO oracle suite.

The integration compiles an original private ESM module with `partitionScoAsyncModule({serverOnlyInitialization:true})`, writes the original to a separate private file, imports it only into the server, and serves exactly the compiler-generated public ESM proxy through `createScoHandler`. The generated public module has an authorized asynchronous `step` method but no `reset` export. A deliberately unauthenticated direct RPC call returned **403**. An authorized client running the same public-only version-space attack obtained a conditional continuation certificate for both **2-state** and **3-state** private SHA-256 models and matched a **16-symbol** previously unqueried sequential continuation. The evaluator separately verified product-state observational equivalence against the known private model after learning. The published ESM response contained neither the private canary nor the private table identifiers.

This local session cookie is a test fixture, not production authentication. The real transport uses loopback HTTP without WAN latency or trusted TLS. A fixture test controls both the private model and the evaluator, so these outcomes do not imply general security or attacker success against arbitrary hidden-state systems. The server code withheld during this test is distinct from the public-cloned continuation behavior.

A follow-up to the initial run materializes the certified representative as an **independently advancing offline stateful client** (`createContinuationClone`); it tests direct offline steps against subsequent authorized server observations. That follow-up requires a later exact-head CI pin before cross-platform success can be attributed to it.

## Security and performance scope

This is a public-only chosen-input attacker against small deterministic SCO oracle functionality, not a production obfuscation feature. The offline combinatorial enumeration, which grows rapidly by number of states, is attacker-side computation and is not part of an obfuscated target's **2.5×** compute budget. No real network RTT, authentication round trip, physical browser, high-entropy keyed function, or larger than three-state continuation-learning experiment was performed for this particular algorithm. Previously reproduced real authenticated SCO relaying and server-private source separation remain separate evidence.

A genuine server with hidden or unbounded state, nondeterminism, time-dependent output, or inaccessible reset-like transitions may not fit this finite-state model. An attacker may still relay actual authorized calls even when version-space certification is impossible. The correct interpretation is **a conditional and reproducibly tested behavioral clone of the live continuation under a small declared state bound**, without recovering its underlying implementation. It should remain in `im-results/` pending independent scrutiny.
