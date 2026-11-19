# General direct-alias worklist optimization, 2026-11-19

## Scope

This intermediate result evaluates the Agent 4 candidate that replaces repeated rescanning of direct identifier-alias declarators inside `proveLocalObject` with a cached reverse alias index and a monotone work queue. The candidate is a **compiler build-time optimization only**. It does not add source secrecy, hostile-runtime integrity, authorization strength, environment locking, or any new claim about the required 2.5x protected-code runtime ceiling.

Candidate compiler source was benchmarked at commit `072811713909481d29644e8460f74eb2a25e63d9`. The later semantic-corpus head `65f3a0843f067cc614093ae9c42a563fe495978e` has the identical `src/properties.js` blob `d6459427053a94d4c0e5c805db3564b67a1d2a29`.

The source-paired control is `dea08a9e220618621db9f7a90533eeeb474b1982`, which already contained the earlier direct-alias fast path. The rich-alias case adds one unrelated verified callable so the old implementation enters its general fixed point, then supplies 2,048 independent owner -> alias -> alias chains. Both arms must produce byte-identical transformed source and the same native result.

## Reproduction

Manual workflow run [44351424434](https://github.com/FlareZ123/obfs/actions/runs/44351424434) executed Node 22.23.4 on Ubuntu and Windows with:

- `OBFS_PROOF_CONTROL_SHA=dea08a9e220618621db9f7a90533eeeb474b1982`
- `OBFS_PROOF_ALIAS_OWNERS=2048`
- `OBFS_PROOF_REPEAT_ALIASES=true`
- `OBFS_PROOF_RICH_ALIASES=true`

The rich-alias emitted source hash was identical in every control and candidate run:
`85a73cddd57cbfa4a171696c7362d2aa2ed57ca5d6022a65bfb1d6c090089079`, with exactly 2,048 property renames.

The same workflow also ran the repository behavioral/adversarial suite, strict JSDoc checks and Ubuntu Chromium integration. A later current-head full validation, run [44352003903](https://github.com/FlareZ123/obfs/actions/runs/44352003903), passed on both operating systems and Ubuntu Chromium after adding a 96-case deterministic callable-rich semantic corpus.

## Rich-alias measurements

### Ubuntu

Control CPU milliseconds:
`[2780.693, 2775.372, 2773.851, 2784.880]`

Candidate CPU milliseconds:
`[1740.205, 1865.578, 1751.049, 1708.866]`

Control/candidate mean CPU ratio: **1.5730641191x**.

Control wall milliseconds:
`[2385.510997, 2383.917997, 2378.086308, 2395.287362]`

Candidate wall milliseconds:
`[1340.293898, 1463.348838, 1360.513117, 1322.560338]`

Control/candidate mean wall ratio: **1.7392557464x**.

### Windows

Control CPU milliseconds:
`[4188, 4032, 3969, 4032]`

Candidate CPU milliseconds:
`[2469, 2485, 2421, 2782]`

Control/candidate mean CPU ratio: **1.5970266811x**.

Control wall milliseconds:
`[3435.3702, 3468.2239, 3428.8735, 3354.3575]`

Candidate wall milliseconds:
`[1858.3357, 1855.2522, 1830.7514, 2077.6099]`

Control/candidate mean wall ratio: **1.7957119289x**.

## Controls and boundaries

The ordinary direct-alias-only 2,048-owner case did not show a general speedup: the source-paired CPU ratios were approximately 1.005x on Linux and 0.966x on Windows. Sparse and mixed controls were also noisy. The result therefore supports the narrower claim that the queue avoids a repeated direct-edge scan in callable-rich fixed points. It is not evidence for universal compiler acceleration.

The semantic invariant is stronger than timing alone: the benchmark asserts byte-identical emitted source between the exact control and candidate and equal native output. The dedicated tests additionally cover private tuple/record carriers, identity-forwarding call results, reflection refusal with an independent positive owner, and 96 deterministic mixed callable-rich graphs.

This report belongs in `im-results/` because it is an engineering/compiler-throughput result rather than an academically established obfuscation-security advance.
