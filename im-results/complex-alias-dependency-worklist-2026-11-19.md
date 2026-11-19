# Dependency-driven complex alias proof worklist, 2026-11-19

## Scope

This intermediate result evaluates a compiler build-time optimization in `src/properties.js`. It replaces repeated rescanning of complex alias declarators and local function formals inside `proveLocalObject` with reverse dependency watchers.

The change does **not** add source secrecy, hostile-runtime integrity, authorization strength, environment locking, or evidence that protected runtime universally satisfies the 2.5x ceiling.

Control compiler commit: `2d540ee324013ff3bf36e878c0f1e2f411c52f6d`, source blob `b5de7ef696c24bb8fe8800408dff9fb3ebb1c76c`.

Candidate compiler commit: `eecb5ba3f880d544b0c64eabeb7b4df2a61f0dd6`, source blob `0a9d7812c17fa9d42fa2efc6747217fe3637326b`. The final validated branch head `1d3248408f589d461a3bc230136d4a6c2f9de8d8` retains that exact compiler blob.

Validation workflow: [44435548448](https://github.com/FlareZ123/obfs/actions/runs/44435548448), Node 22.23.4 on Ubuntu and Windows. Both jobs passed the behavioral/adversarial suite, source-paired A/B, strict JSDoc checks, runtime profiles, and their applicable browser gates. Ubuntu Chromium completed successfully.

## Fixed-point equivalence invariant

For one candidate owner, every expression accepted by the existing `resolves()` grammar has one of three proof states:

1. unsupported;
2. already resolved through a root-specific private carrier or captured-root return;
3. dependent on one alias identifier.

A complex alias therefore contributes either an unconditional fact or a unary implication `dependency -> target`.

A formal parameter is accepted only when every syntactic call site resolves. Its proof condition is therefore a finite conjunction of alias dependencies. The candidate registers that conjunction once and removes dependencies as aliases enter the monotone queue. Direct identifier aliases continue to use the reverse index merged in PR #133.

The queue begins with the root binding. Cycles without a seed remain unproved. Because the proof is monotone and downstream escape/reflection validation runs after closure, order of discovery does not change the least fixed point.

## Dedicated semantic coverage

`test/complex-alias-dependency-worklist.test.js` covers:

- a 96-level reverse-ordered formal dependency chain;
- all-call-site refusal when one argument is outside the proof grammar;
- a positive all-call-site control;
- private tuple and record carriers feeding separate dependent formal chains;
- an unseeded formal dependency cycle;
- reflection refusal beside an independent positive private owner.

An early fixture reused the same parameter spelling across several helper functions. The current analyzer intentionally requires globally unique simple binding names, so those formals were ineligible before the new worklist ran. The corrected fixture gives each formal a unique name and the full suite is green. This was a test-contract correction, not a relaxation of the compiler.

## Source-paired controls

The A/B harness still exercises the established 512-owner, 2048-owner, mixed, sparse, and direct-alias workloads. It adds:

- `dependencyMixed`: identity-return aliasing, tuple/record carriers, direct aliases, an all-sites refusal, reflection refusal, exactly three positive private-field rewrites;
- `dependencyAliases`: a reverse-ordered chain of 385 functions/formals, depth 384, constructed so the control fixed point can discover only one new formal per pass.

Every control/candidate group requires byte-identical emitted source and equal native output before timing is reported.

The mixed corpus initially exported an array while the historical harness used strict scalar checksum equality. It was corrected to a non-vacuous numeric checksum without changing the proof behaviors under test.

## Depth-384 measurements

### Ubuntu

Control CPU milliseconds:
`[367.608, 387.435, 388.319, 381.225]`

Candidate CPU milliseconds:
`[307.098, 301.082, 301.105, 320.962]`

Control/candidate mean CPU ratio: **1.2392527679x**.

Control wall milliseconds:
`[186.734641, 197.864607, 199.240982, 193.972463]`

Candidate wall milliseconds:
`[144.529986, 143.984339, 146.881110, 154.003432]`

Control/candidate mean wall ratio: **1.3196711710x**.

### Windows

Control CPU milliseconds:
`[422, 345, 563, 422]`

Candidate CPU milliseconds:
`[313, 281, 391, 344]`

Control/candidate mean CPU ratio: **1.3182844244x**.

Control wall milliseconds:
`[203.1263, 222.4402, 231.7819, 210.9392]`

Candidate wall milliseconds:
`[172.7396, 160.1646, 160.0252, 167.5511]`

Control/candidate mean wall ratio: **1.3146301821x**.

Both operating systems emitted the identical dependency-chain SHA-256:
`8ccc6191f080952cb265a618ff599fd3e2b029f8e533ffdfd8dc5b0e16683f77`, with exactly one property rewrite.

The mixed dependency corpus also emitted the same source on both arms and platforms:
`ee2ac587900090716959804ab3b04ac7fb20fde158c76c58606ace764ff1dc28`, with exactly three property rewrites.

## Controls and limits

The optimization is workload-specific. On Ubuntu the established controls ranged from approximately 0.968x to 1.014x mean CPU ratios, with similar small wall variation. Windows samples are coarse and noisier; several non-target workloads show apparent gains or regressions that should not be generalized from these small samples.

The supported claim is narrower: on the adversarial reverse formal-dependency chain, eliminating repeated whole-collection fixed-point scans materially reduces compiler build time on both tested operating systems while preserving byte-identical emitted source. The full repository suite and Chromium integration preserve observed behavior.

This is an engineering throughput result and belongs in `im-results/`, not an established security result in `results/`.
