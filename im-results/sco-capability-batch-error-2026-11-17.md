# Adversarial SCO capability batch invalid-input semantic counterexample (17 November 2026)

**Status:** bounded counterexample **and** first-error guarded-batch mitigation verified on actual generated public ESM and real HTTP. Full Ubuntu+Windows Node 22 manual workflow [44152712195](https://github.com/FlareZ123/obfs/actions/runs/44152712195), exact executable SHA ed57acb0ff9c758c4d8af2be58f647d13a0840ae, passed both jobs, including strict SCO JSDoc. Initial narrower all-valid plus invalid-item counterexample also passed full [workflow 44151887716](https://github.com/FlareZ123/obfs/actions/runs/44151887716), SHA ff5cdb2243da12dbdaeb037a56101bb755d2f91b. The prior performance comparison at im-results/sco-capability-http-batch-2026-11-17.md did not certify error semantics.

## Counterexample hypothesis

Consider a stateful server-private capability with position count initially zero. Each successful step with a valid symbol (zero or one) advances count. Each invalid input is rejected by the trusted server's authorizeOperation callback **before private execution**. A client calls five valid steps and then submits invalid symbol 2. The five successful steps have already committed. A different client attempts one batch containing the same five valid symbols followed by symbol 2. If the authorization callback prevalidates all batch elements before executing any private work, it rejects the entire batch and commits zero steps.

The test expects state positions five versus zero, with both invalid requests denied prior to private work and with exactly matching outputs for the all-valid sequence. These two observable histories contradict transparent substitution of arbitrary sequential RPCs with one prevalidated batch. This is a *contract gap*, not a security bypass. It can be resolved by designing an explicitly atomic batch business contract, by returning per-item results and preserving partial-progress behavior, or by keeping serial calls where all-or-nothing replacement cannot be proved valid.

## Reproduction

Run on Node 22:

~~~powershell
node --test test/sco-capability-batch-error-contract.test.js
npx tsc -p jsconfig.sco-oracles.json
~~~

The script uses partitionScoAsyncModule, the actual server-only ESM and public emitted facade, createScoHandler with a real HTTP JSON RPC, and createScoCapabilityScope/createScoPrivateHandles on a verified test principal. One successful serial sequence and one successful batch sequence must yield the same five outputs and final position five. Invalid serial and batch inputs then exercise independent new handles, testing that both methods are denied before entering trusted private work and that the committed prefixes differ.

## Security, correctness, performance boundaries

The test does not claim that batch-as-atomic-transaction is defective; a batch and a serial sequence are different public APIs unless equivalence has been proved for the application's required error and cancellation semantics. A successful test constrains deployment of the batch performance result, rather than invalidating its measured all-success timings. Cross-account handle replay, source withholding, cryptographic strength, timeout behavior, request concurrency and full applications are separate. The browser compatibility result, where available, also covers only all-success paths.

## Conditional mitigation: first-error prefix-preserving batch

The next version of the test introduces an explicit alternative private batchPrefix operation. Its HTTP admission checks that the envelope contains a bounded array of safe integers, while the trusted callback checks the admissibility of **each** element before mutating state. It processes valid items in order, stops at the first invalid symbol, and returns an error index plus committed prefix outputs.

The candidate behavior expected for five valid symbols, invalid sixth symbol 2, and an optional valid seventh symbol is:

| Public operation pattern | Committed position after failure | Returned error index | Position after one more valid step |
| --- | ---: | ---: | ---: |
| Five serial successful steps, then rejected sixth | 5 | Rejected RPC | 6 |
| Single whole-batch preauthorization | 0 | Rejected RPC | 1 |
| Trusted ordered batchPrefix with per-element policy | 5 | 5 | 6 |

The new script asserts all-valid output parity, exact returned prefix outputs, and matching post-error continuation between serial and guarded batch. This is a narrow constructive counterexample to an overbroad claim that all batching must violate serial prefix semantics. It is explicitly **not** equivalence under concurrent third-party mutations, mid-batch external visibility, cancellation or arbitrary exception/transaction behavior. Those conditions would require a richer application contract and additional tests.

The guarded batch's syntactic outer authorization now admits integer 2 as part of its envelope, while the trusted private callback must reject that element before the corresponding private state transition. The test checks that no forbidden step is applied; it does not recommend broad acceptance of arbitrary JSON or executing untrusted callbacks inside the private server. A separate exact JSDoc and real-HTTP CI pin is required before calling this mitigation verified.

## Executed guarded-batch observation

Both cross-platform job logs for exact source ed57acb0ff9c758c4d8af2be58f647d13a0840ae printed and independently asserted the following, after the model and HTTP facade were initialized:

| Observable | Ubuntu | Windows |
| --- | --- | --- |
| All-valid serial/batch result positions matched | 5/5 | 5/5 |
| Serial count after valid prefix then invalid sixth symbol | 5 | 5 |
| Whole-batch preauthorization count after same invalid sixth symbol | 0 | 0 |
| Invalid step and whole-batch rejected before private work | Yes | Yes |
| Unauthenticated RPC | 403 | 403 |
| Guarded per-item batch stopped at first invalid index | 5 | 5 |
| Guarded per-item batch committed same five prior steps | Yes | Yes |
| Guarded batch continuation after one further valid step matched serial count/output | Yes | Yes |

The first-error guarded design returns its own explicit partial-success status and commit-prefix outputs. It is a **different documented public contract** from an exception-throwing serial protocol until the client adapter defines and validates how to translate it. It makes one previously failing state-progress example compatible under this selected contract; it cannot be advertised as a general-purpose rewriter of arbitrary Promise, cancellation, exception, interleaving or introspection semantics.

The deliberate counterexample gives a concrete release gate: where callers can see intermediate state changes or errors, only proven equivalence or an explicit batch API migration is admissible. This is independent of the measured heavy-workload 2.5× performance results and of the separate same-account finite-state reconstruction attack.
