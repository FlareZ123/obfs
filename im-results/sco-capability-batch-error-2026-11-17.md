# Adversarial SCO capability batch invalid-input semantic counterexample (17 November 2026)

**Status:** predeclared executable regression awaiting pinned cross-platform result. The real-HTTP performance comparison at im-results/sco-capability-http-batch-2026-11-17.md showed a possible server-side optimization with 16 batch inputs. This test asks whether that optimization is semantically transparent when an RPC sequence includes invalid input.

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
