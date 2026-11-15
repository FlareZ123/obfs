# Same-source attack and performance decision grid (first checkpoint)

Date: 2026-11-15. Researcher: Agent 8. Status: intermediate, reproducible negative evidence; **no peer-reviewed or universally bounded security claim**.

## Pinned source and execution

- Git commit under test: `d45e70ea44e26a683498ffe5109ba83406256fb7`.
- Reproduction: `node sims/decision-grid.js` after installing `package.json` dependencies.
- Manual Node 22 CI: [run 43690746803](https://github.com/FlareZ123/obfs/actions/runs/43690746803), both Ubuntu and Windows jobs successful.
- Fixture source: `function compute(a,b){return (((a^b)+17)*3);}module.exports=compute;`.
- SHA-256 of source: `9acd0b52b06e280a83c620b105057967fe07a94c6b26b265e20ea01111dcbeab`.
- Candidates: shipping `src/` Acorn compiler, `lib/transform.js` TypeScript-checker comparison, and opt-in `sims/expr-vm.js` public postfix VM. Same source and eight unpublished deterministic build seeds were used for each. Neither `lib/` nor postfix VM is in the default CLI pipeline.

## Attacker outcome and transformation coverage

The attacker receives **only generated source** with no original source, seed, instrumented target, debugger, or runtime oracle. For main/checker variants, `recoverPlain` extracts the externally declared native operator expression from the transformed AST. For VM, `recoverExpressionVm` independently decodes the public switch semantics and cached bytecode table. Researchers then compare executable reconstructed functions with original behavior on 267 held-out primitive/exception inputs, including numeric edge values, strings, booleans and BigInt.

| Candidate | Protected source bytes | Output bytes | Coverage | Offline recovery successes | Held-out semantic equivalence |
|---|---:|---:|---|---:|---|
| Main Acorn AST, `strings:false` | 68 | 120 | 2 identifier bindings, 0 object properties, 0 literals | 8/8 seeds | 267/267 |
| TS checker comparator | 68 | 68 | 0/0 closed object allocations | 8/8 seeds | 267/267 |
| Experimental postfix VM | 68 | 825 | 1 function, 7 instructions | 8/8 seeds | 267/267 |

**Static-resistance result:** this pure expression was reconstructed successfully from all three outputs across all eight seeds, with no server information. Random opcode numbers only changed the public decoding map. This is a narrow, automated *attacker-success* result; it does not demonstrate full generalized deobfuscation across all JavaScript. The source-only reverse-engineering code is checked into `sims/decision-grid.js` and `sims/expr-vm-static-recover.js`.

## Runtime, separate dimensions

The test uses the same Node process, one compiled function per candidate, four warmups and seven alternating original/candidate timing pairs per workload. Each number below is a **median of paired measurements**. Isolated hot work invokes the pure function 120,000 times with varied numeric arguments. The mixed surrogate executes 150,000 iterations of native arithmetic (12 integer operations per iteration) and calls the candidate once every 256 iterations. Input/output checksums are exact. Source compilation/build time is excluded from both hot and mixed timing; the 9-sample `new Function` compile measurement below is only a noisy proxy for initialization, not an independent process cold start.

| Candidate | Linux hot ratio | Windows hot ratio | Linux mixed ratio | Windows mixed ratio | 2.5× requirement |
|---|---:|---:|---:|---:|---|
| Main AST | 1.004× | 1.000× | 0.999× | 0.987× | Met in this fixture |
| TS checker | 1.001× | 1.011× | 1.010× | 1.005× | Met in this fixture |
| Postfix VM | 15.801× | 15.980× | 1.019× | 1.071× | **Fails hot path**, passes diluted mixed scenario |

VM's isolated hot cost remains far above 2.5× despite the lower ratio than independent prior experiments that used different source, inputs and harness (64× to 88× in `im-results/expr-vm-cost-2026-11-15.md`). The mixed ratio is near 1 because protected calls are infrequent. It is an application-level observation, not permission to ignore hot path violations in other apps. The code-size expansion is more than 12× for this tiny function. In-process `new Function` compile median ratios were 0.389×/0.400× (AST), 0.963×/0.875× (checker), and 2.359×/2.857× (VM), Linux/Windows. These sub-millisecond compile medians are noisy, affected by V8 caching, and must not be treated as measured standalone cold-start guarantees.

### Five independent decision dimensions

1. **Static reconstruction:** eight of eight held-out seeds recovered for each candidate. No added resistance established.
2. **Runtime extraction/instrumentation:** not experimentally exercised in this narrow grid. In COO/SNO, the model grants the attacker the shipped code and/or process; the existing `test/adversary.test.js` and mode scorecard document separate extraction cases.
3. **Tamper/authorization:** not evaluated in this local-only fixture. None of these candidates introduces an independent trusted authorization authority.
4. **Compatibility:** all 267 primitive/exception probes agreed. This is insufficient to certify reflection, cross-file object identity, browser APIs, or arbitrary JS.
5. **Performance:** only the postfix VM violated 2.5× on the isolated protected hot kernel. Ratios, source expansion and setup uncertainty are reported separately.

## Decision and next experiment

- **Main Acorn AST:** retain as baseline correctness/performance transform; treat the transformed output as recoverable.
- **TS checker comparator:** keep as research comparator. It transformed no part of this pure numeric fixture.
- **Experimental postfix VM:** reject for default deployment until it demonstrates a measurable attack-cost increase on held-out challenges **and** satisfies the 2.5× budget on the actual selected function. Simply optimizing a static recoverable VM is not sufficient.
- **Next comparison:** use a pinned multi-module application with private object properties and a genuine SCO server-resident module partition. Record static reconstruction and authorization/oracle behavior, latency granularity, end-to-end elapsed time, and server CPU separately. Include native browser and Node linkers where applicable.

The exact script, build seeds, oracle-free attacker, held-out input generator, and CI run preserve the evidence. This document belongs in `im-results/`, pending independent confirmation and a larger corpus.
