# Authorized black-box learning of stateful SCO private execution

Date: 2026-11-15. Agent 49. **Intermediate reproducible attack evidence.**

## Reproduction and tested revision

- Executable attacker and four-state fixture: [sims/sco-stateful-oracle.js](../sims/sco-stateful-oracle.js)
- Focused tests: [test/sco-stateful-oracle.test.js](../test/sco-stateful-oracle.test.js)
- Manual-only Linux/Windows workflow: [.github/workflows/manual-sco-oracle.yml](../.github/workflows/manual-sco-oracle.yml)
- Pinned [successful run 43711404113](https://github.com/FlareZ123/obfs/actions/runs/43711404113) on commit **3fccb3e5a1026a4509d9abda979823debedbaf57**. Both jobs passed the focused tests, reproducible attack and existing SCO oracle checks. Root JSDoc type checking passed, but the simulation is not included in the root typecheck's source set.

## Threat model and source boundary

The server uses production partitionScoAsyncModule, bindScoModuleExports and createScoHandler APIs. A private ESM module defines a deterministic Mealy machine with four hidden states, a binary input alphabet, private transition/output tables, a canary and mutable server-side state. The generated and HTTP-served client ESM facade exposes reset() and step(symbol); neither private table access nor the canary appears in the served source.

A session-cookie coarse authorization hook and method/argument authorization protect both operations. An unauthenticated request returns **HTTP 403**. The adversary carries a genuinely authorized session, consistent with the stated threat model's allowance for unlimited legitimate requests. This experiment tests black-box learning; it does not bypass authentication or extract private implementation source.

Four reproducible private fixtures use seeded pseudorandom transitions plus an input-zero four-state ring with a rotated 0011 output pattern. The learning function receives **only** the public reset/step API. The model seed, transition table, original source and state values are never passed into the learner. The full fixture code is public for reproducibility; attacker separation is the function boundary, not secrecy of the test repository.

## Learning method

The attacker assumes a known **four-state upper bound**, two legal input symbols and a reset operation. For each discovered access sequence it resets and replays that sequence, then tests every nonempty suffix of length 1, 2 or 3. There are **14** such suffixes. The vector of suffix outputs is a behavioral state signature.

A breadth-first search adds one access sequence for each distinct signature, then constructs a state transition/output table from those signatures. In a deterministic Mealy machine of at most four states, distinguishable states have some distinguishing suffix shorter than four symbols, so the procedure determines the observable quotient within this model. Observationally equivalent hidden states may merge.

The learner never reads the private state variable. Every training probe crosses the emitted public RPC proxy and real HTTP handler. The trusted fixture is used only for held-out validation without further RPC probes.

## Exact cross-platform output

| Metric | Ubuntu | Windows |
|---|---:|---:|
| Private fixtures learned | 4/4 | 4/4 |
| Total authorized reset/step requests | 2,736 | 2,736 |
| Requests per fixture | 712, 656, 712, 656 | 712, 656, 712, 656 |
| Learned observable states | 4 in each | 4 in each |
| All validation binary sequences of lengths 1..10 | 8,184/8,184 | 8,184/8,184 |
| Exact validation sequences absent from all training trace prefixes | **7,872/7,872** | **7,872/7,872** |
| Public source contains private canary/table accesses | No | No |
| Unauthenticated RPC status | 403 | 403 |
| Combined learner execution time | 1,062.548 ms | 1,471.224 ms |
| Focused tests passed | 2/2 | 2/2 |

Individual online learning times in milliseconds were Ubuntu **375.623, 275.525, 230.424, 180.976** and Windows **481.169, 397.957, 332.287, 259.811**. These are loopback HTTP measurements from GitHub runners, **not** an application slowdown bound or 2.5x performance claim.

## More rigorous validation independence (subsequent verified revision)

The original run 43711404113 checked every binary word of length 1..10 without extra RPC queries. Some of those 8,184 words had already occurred as complete training traces or as prefixes of training traces. The original table's term 'held-out' was therefore too broad. The table above retains the original 8,184/8,184 all-word check, relabels it accurately, and adds the strictly unseen subset from a subsequent source update.

On both Ubuntu and Windows, [manual run 43714456617](https://github.com/FlareZ123/obfs/actions/runs/43714456617) at pinned head **9678808f5ac619194b6a30053f9a7d5d467e1e34** verified **7,872/7,872 exact words not previously issued as a complete post-reset query or observed as any training prefix** across four scenarios, 1,968 per scenario. The remaining 312 words overlapped training in this conservative comparison; all 8,184 still matched the private fixture. The attack retained 2,736 legitimate requests. Dedicated strict JSDoc checking for both SCO state-machine simulations also passed on both runners.

Independence here means the particular exact binary input word was absent from training probes. It does not imply statistical independence of observations, a randomly sampled distribution, or a formal learning-theory generalization guarantee. The fixture is deterministic and has only four states; suffix-signature learning explicitly exploits that assumption.

## Implications and limitations

A small, resettable, observable state space can be behaviorally cloned through a perfectly authorized SCO interface even when implementation source remains private. This extends the repository's prior stateless bounded-domain, polynomial and piecewise oracle counterexamples to **stateful** computation using the emitted proxy.

The experiment does not establish extraction of secret keys, original implementation source, arbitrary state machines, large or nonresettable state, nondeterministic programs, arbitrary alphabets, or cryptographically strong functions. Quotas, a missing reset operation, much larger hidden state, or different authorization semantics alter the attack surface. This fixture deliberately exposes a reset method. The 2.5x normal-compute requirement is not evaluated here because the measured calls are attacker learning queries.

Future positive SCO claims should include a learnable-state and chosen-input analysis next to source-withholding, authorization and ordinary application-performance evidence. An observed 403 protects an unauthenticated operation; it does not prove secrecy of behavior available to legitimately authorized clients.
