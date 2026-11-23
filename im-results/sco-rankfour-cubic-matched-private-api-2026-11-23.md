# Matched authenticated SCO and esbuild-private-API clone of a rank-four cubic permutation

**Status:** intermediate, reproducible negative result for one bounded source family.  
**Run:** [manual-low-rank-target-inversion #149](https://github.com/FlareZ123/obfs/actions/runs/45162509026), tested head `b9cfb98e59859b207b5e39770807550e0d32f134`. Both `windows-latest` and `ubuntu-latest` jobs completed successfully, including the new live-clone step and project JSDoc typecheck.

## Question

For a fixed deterministic 32-bit function whose nonlinear part has algebraic degree at most three and depends on four independent parity projections, does SCO's server-private source partition create a functional-oracle cloning barrier beyond an ordinary authenticated private API whose server-side implementation is minified?

This is a matched black-box comparison, not a claim about all SCO configurations.

## Source family

The private ESM export `protectedCubic` is a 32-bit permutation. Its four parity masks are:

- `0x00015555`
- `0x0002aaaa`
- `0x0000f0f0`
- `0x00033333`

Their binary rank is four. Let their parity outputs be \(z_0,z_1,z_2,z_3\). The function applies an invertible linear mixing to the low 20 input bits, leaves the high 12 affine coordinates unchanged, adds a fixed offset, and applies these nonlinear corrections to high output bits:

- bit 28: \(z_0 z_3\)
- bit 29: \(z_1 z_3\)
- bit 30: \(z_0 z_1 z_2\)
- bit 31: \(z_1 z_2 z_3\)

The low-20 mixing is a composition of invertible triangular shears. All four parity masks depend only on the low 20 input bits, while nonlinear corrections affect only the high 12 output bits. Thus the map is triangular: recover the low 20 input bits from the low 20 output bits, then recover the high 12 bits after recomputing the corrections. The source is therefore a permutation, not a non-injective lookup-table example.

The top cubic ANF component is \(e_{30} z_0 z_1 z_2 + e_{31} z_1 z_2 z_3\). Its third-derivative tensor has scalar components \(\phi_{012}\) and \(\phi_{123}\), whose radicals are \(\langle e_3\rangle\) and \(\langle e_0\rangle\), respectively. Because the output directions \(e_{30},e_{31}\) are independent, the vector-valued tensor's joint radical is their intersection, \(\{0\}\), so its joint-radical codimension is four. The script independently checks projection-mask rank four and top-projection radical size one.

## Experiment

The attack uses `cloneProjectedCubicValidated` with \(\delta=10^{-10}\), independent witness and verifier CSPRNG tapes, and an asynchronous replay adapter that turns each missing synchronous oracle value into one authenticated HTTP RPC.

Two arms run the same source and JSON RPC contract:

1. **SCO:** `partitionScoSelectedAsyncExports` hides the private export and dependencies; `createScoHandler` serves the generated facade and forwards authenticated calls to the private function.
2. **Equal-trust conventional control:** the same private ESM source is transformed with esbuild (`format: esm`, `minify: true`, `target: es2022`) and loaded only on a conventional Node HTTP server. The minified implementation is not served to the caller.

Both arms are local loopback HTTP servers bound to `127.0.0.1`; this exercises the real HTTP/RPC serialization and authorization handlers, not WAN latency or a deployed remote service. Both arms use the same realized witness and verification tapes. The caller receives only the method route, one legitimate credential, and the input/output protocol. No source text or private helper names are supplied to the cloning routine. An unauthenticated RPC attempt is made against each arm.

After learning, each HTTP server is closed. The serialized model is then evaluated on the same 1,028 distinct deterministic held-out inputs in both arms, none present in the query cache, and compared against the private evaluator in the test harness. The script hashes each sorted held-out set and asserts the hashes are identical across arms. Those direct held-out comparisons are not additional RPCs.

## Results established by the passing run

The script asserts all of the following in both operating-system jobs:

- the fast cubic branch is used (`degree === 3`);
- postfit verification passes and exact-interpolation fallback is not used;
- the total number of distinct oracle queries is at most **1,308**;
- SCO and minified-control query counts are equal;
- the ordered input/output transcript hashes are equal;
- all **1,028 / 1,028** distinct held-out outputs match in each arm after its server has closed, using the same held-out set;
- private server executions equal the number of actual oracle queries;
- unauthorized requests receive HTTP 403;
- private mask and helper names do not appear in the published SCO facade;
- offline evaluation makes no further private RPC calls.

The script prints the exact query count and transcript digest in its JSON result. The reproducible upper bound asserted by the test is 1,308 (fast cap 1,135 plus the 173-sample Reed–Muller postfit verifier). The 1,135 fast cap budgets 58 witness trials using the rank-four learner's worst-case nonzero-third-derivative probability (21/64): ((43/64)^{57}=1.4304\times10^{-10}) exceeds (delta), while ((43/64)^{58}=9.6102\times10^{-11}) is below it. The exact count is deliberately not transcribed here without a source-pinned log excerpt. The 173-sample verifier cap is tight for independent uniform testing under only the degree-≤3 promise: a degree-three monomial difference has exact relative support \(1/8\), the minimum distance of \(RM(3,32)\), and the silent-rank family in `im-results/single-pivot-silent-rank-family-and-postfit-guards-2026-11-23.md` realizes this case. The false-accept probability is therefore \((7/8)^m\): 172 samples give \(1.0602\times10^{-10}\), above \(\delta=10^{-10}\), while 173 give \(9.2767\times10^{-11}\), below it. This establishes minimality for this uniform-independent-sample verifier, not for every possible structured verification strategy. For comparison, a generic full degree-≤3 ANF basis over 32 input bits contains \(\sum_{j=0}^{3}\binom{32}{j}=5,489\) monomials. Thus the validated fast-path cap is at most 23.8% of that generic basis count (at least 4.19× fewer queries); this is a combinatorial attacker-cost comparison, not a security boundary under the unlimited-request threat model. This 5,489-query generic bound is also information-theoretically optimal for an unrestricted 32-bit vector-valued degree-≤3 oracle: there are 5,489 independent ANF coefficients per output bit (175,648 coefficient bits total), and each query returns only 32 bits, so at least 5,489 queries are necessary; the weight-≤3 ANF basis attains the bound. The 1,308 cap therefore uses the additional rank-four projection promise, plus probabilistic postfit validation. This efficiency gain is conditional on that promise: if postfit validation rejects the fast candidate and exact interpolation runs, the wrapper's n=32 worst-case hybrid cap is 6,268 (including the fast work, verifier, and remaining weight-three basis), about 14.2% above the generic 5,489-query learner. The fallback is a correctness safeguard, not a cheaper out-of-promise path.

## Interpretation

For this specific fixed, stateless, degree-≤3, projection-rank-four 32-bit permutation family, a legitimate caller can reconstruct the complete tested function behavior through the SCO facade. The same attacker, with the same random tapes, obtains the same query count and transcript against an ordinary server-private esbuild-minified implementation. In this experiment, server-private source partitioning does not add functional-oracle resistance beyond the matched private API.

This adds a distinct low-degree rank-four cubic source family to the existing rank-three matched private-API experiment and the rank-five arbitrary-table HTTP experiment. It is useful as a negative candidate-screening test: a design must not treat server-side source hiding alone as a barrier to functional cloning for this source class.


### Relation to earlier oracle attacks

This is a **targeted efficiency improvement**, not a broader function-class result than the rank-five arbitrary-table learner: the new method exploits the degree-three promise and four-dimensional projection structure, and its asserted cap is at most 1,308 unique queries. The earlier arbitrary-table path is less structurally restrictive but substantially more query-intensive. Since the threat model permits unlimited legitimate requests, the query reduction is an attacker-cost observation, not a security boundary. The functional-cloning conclusion is the same in both cases: once a fixed deterministic oracle function is exposed, server-private source placement alone does not stop a sufficiently capable authorized caller from learning its behavior.

## Scope and limitations

- The source is synthetic and deliberately satisfies the attack's degree and projection-rank promise. This does not establish that a current production candidate has this structure.
- The test uses a fixed deterministic stateless function. It does not exercise SCO's stronger dynamic sharding, per-request mutation, server-held secret refresh, or stateful integrity mechanisms.
- The result is functional reconstruction, not recovery of original JavaScript source, server memory, signing keys, or other private state.
- It does not establish a result for arbitrary JavaScript, COO, or SNO.
- It does not measure the obfuscator's 2.5x target-runtime budget, dynamic-analysis resistance, or domain-lock bypass resistance.
- Both arms intentionally allow a legitimate credentialed caller to make repeated chosen-input requests; unauthorized requests are denied.
- No release-gate status changes follow from this synthetic source-family test. The repository's overall release assessment remains **RELEASE-BLOCKED**.

## Reproduction

- Attack and matched-control script: `sims/sco-rankfour-cubic-matched-private-api.js`
- Learner and verifier: `sims/rankfour-projected-cubic-validated-peer.js`
- Cubic functional model: `sims/rankfour-projected-cubic-rescue.js`
- Strict JSDoc project: `jsconfig.affine-low-rank-peer.json`
- Manual workflow: `.github/workflows/manual-low-rank-target-inversion.yml`
- Run: [#149](https://github.com/FlareZ123/obfs/actions/runs/45162509026) (both OS jobs and strict JSDoc succeeded)

The run is a focused reproducibility receipt for this intermediate attack result, not a production security certification.
