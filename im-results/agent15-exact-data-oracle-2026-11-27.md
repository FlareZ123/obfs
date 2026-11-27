# Exact ordinary-data behavioral oracle and private-class compatibility test

**Status:** intermediate, test infrastructure only. No production compiler change; no security or release claim.

## Why this matters

Existing differential harnesses, including the class-leaf matrix and feature-directed CommonJS semantics test, sometimes compare `JSON.stringify` of exported values. That comparator is suitable for the explicit JSON-compatible subset but cannot establish exact JavaScript value or graph parity. Native negative controls show these collisions:

- `0` vs `-0`
- `NaN` vs `null`, `Infinity` vs `-Infinity`
- `[undefined]` vs `[null]`, a sparse array slot vs explicit undefined
- repeated reference to one object vs separate structurally identical objects
- non-enumerable own property vs no property
- plain record vs null-prototype record; extensible vs nonextensible empty record

BigInt serialization throws rather than providing a comparison. These are comparator limitations, not observations of compiler-induced differences in existing fixtures.

## Candidate-specific native comparison

Isolated branch [agent15/class-value-fidelity-20261127](https://github.com/FlareZ123/obfs/tree/agent15/class-value-fidelity-20261127) adds one test file to the earlier draft PR #345 head `0204dd77264e2d88fb6ddf832b364847db033ac9`. It does not modify the compiler.

- Test commit `88a420dd968e77b4eb34e7eb06241c1cdeb5f525`, `test/private-class-value-fidelity.test.js`.
- Native baseline and emitted comparisons use `Object.is` for 14 scalar expressions and check explicit repeated object reference identity, public record keys, array elements, and RegExp state for 3 reference fixtures. All are executed in fresh Node VM contexts in each of the three compiler modes, giving 42 scalar and 9 reference comparisons per OS.
- The numeric positive control requires two property rewrites in each mode. A further assertion requires at least one nonordinary scalar case with two actual rewrites in each mode. Individual transformation counts are logged by the test; reference-fixture refusals are not presented as transformed parity.
- [Focused run 45924571853](https://github.com/FlareZ123/obfs/actions/runs/45924571853) completed success at the exact test commit on Ubuntu and Windows, including all configured strict JSDoc steps. The full node22 job was skipped. Thus the assertions and at least six nonvacuous scalar mode cases passed; the exact count of transformed reference cases is not asserted. No claims for actual browser/SCO HTTP/SNO deployment behavior follow from Node VM-only mode configurations.
- This test-only branch is not a current mainline acceptance receipt. PR #345 remains draft and unmerged. Its older full run [45252486564](https://github.com/FlareZ123/obfs/actions/runs/45252486564) was red (Ubuntu 5,217 passed / 15 failed / 8 skipped; Windows 5,208 passed / 16 failed / 16 skipped). The extra Windows live RPC `fetch failed` is not established as a class-candidate-caused regression.

## Reusable bounded oracle

A separate main-based, isolated [agent15/semantic-data-oracle-20261127](https://github.com/FlareZ123/obfs/tree/agent15/semantic-data-oracle-20261127) branch contains:

- `sims/semantic-data-oracle.js` (blob `19f557a791b4bd00cbaa1d70c05ca92eb0732e51`).
- `test/semantic-data-oracle.test.js` (blob `e713aa2c07d42bcd865a9b37aad43edce91818be`).
- The two files passed four standalone tests and strict JSDoc locally under Node v22.16.0, then the uploaded Git blob SHAs were checked against local `git hash-object` values. Branch head `85c0914c4f9b1488619f4db12f27a797938d867c` additionally includes both files in `jsconfig.external.json`. Focused two-OS run [45924847964](https://github.com/FlareZ123/obfs/actions/runs/45924847964) queued at that exact head at the time of writing.

`snapshotDataGraph(value, realm)` emits deterministic JSON-compatible tagged observations of a **test-controlled ordinary data graph**. It preserves the distinctions above, primitive type/value, own key order, data descriptor flags, array holes, graph aliases/cycles, local symbol identity relationships, global and well-known symbol identity, and object extensibility. The realm supplies the known Object/Array prototype identities for cross-realm comparisons. Local symbols are compared up to a deterministic renaming within the observed graph; identity relative to a pre-existing external symbol requires an explicit external anchor.

The implementation does not invoke `toJSON`, getters, user coercion or prototype traversal. It refuses callable values, Proxy objects, accessors, unsupported prototypes and recognized exotic objects, and bounds depth, object count and total own properties. The tests independently verify that a refused accessor or Proxy does not run its supplied callback/trap. It is **not** a generic JavaScript equivalence theorem. It assumes test-controlled ordinary data and trusted host intrinsics; unrecognized host exotica, mutable prototype contents, function behavior, runtime side effects, error stacks, asynchronous ordering and cross-process symbol anchors require distinct observation protocols. A refusal is not a pass.

## Reproduction

On the corresponding isolated branch:
```sh
node --test test/private-class-value-fidelity.test.js
# or for the independent utility branch:
node --test test/semantic-data-oracle.test.js
npm run typecheck:external
```

No per-commit workflow was added. This is test-only infrastructure: it adds no emitted runtime computation and does not establish a 2.5x bound. The production release decision remains RELEASE-BLOCKED. For future generated semantic corpora, use exact tagged observations for declared ordinary data outputs, keep native and emitted execution boundaries matched, report refused observations separately, and retain JSON serialization as its own explicit test when JSON is the application contract.
