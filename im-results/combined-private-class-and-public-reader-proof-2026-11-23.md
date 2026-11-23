# Exact-source combined private class and public-wrapper reader ownership proofs

**Agent 46, 23 November 2026. Intermediate research, not a release-grade result.**

## Design and source pins

The experiment asks whether two separately bounded, conservative property-renaming coverage improvements compose without changing observable public function text.

- **Candidate:** [`agent46/private-proof-convergence-20261123`](https://github.com/FlareZ123/obfs/tree/agent46/private-proof-convergence-20261123), commit `602dbc575ed430ba758d950a05eb2ee4e80a94c3`. Based on main at `5123a79c9e8b8c313bac50e845b339c51cc9f980`. Exactly one production file changed, `src/properties.js` (blob `0904827d17c1fb29cf84a71e82509d15ab5f3164`). It adds `test/private-class-method-proof-admission.test.js` (+57 cases) and `test/private-reader-public-wrapper-proof.test.js` (+27 cases).
- **Matched control:** [`agent46/private-proof-convergence-control-20261123`](https://github.com/FlareZ123/obfs/tree/agent46/private-proof-convergence-control-20261123), commit `f0622a9cc2b755506bc00e2811e6757f31ba5758`. Tests and other code identical to the candidate, but `src/properties.js` is exactly the original blob `bda3c6097e2679f59bd003fa0aed3e0291d4ba4c`.

The candidate's compiler adds a guarded local noninheriting one-method class, whose method returns one owned inert field through direct calls on privately constructed instances **after** class declaration. Exported/escaped class, methods, instances, inheritance, unknown calls, and reflection refuse.

The second, separate admission permits an unchanged owned-object identifier passed inside an exported callable to a direct-call-only private reader whose complete body is `return formal.staticField`, or the equivalent `const v=formal.staticField;return v;`. The public exported wrapper retains its original source text. Host-observable field expressions in the exported function, escaped reader functions, unknown argument provenance and identity-return helpers refuse.

## Source-matched full validation

Both full workflows use Node **22.23.4** on Windows and Ubuntu and exactly **5,215** test definitions per platform:

| Source | OS | Tests | Pass | Fail | Skip |
| --- | --- | ---: | ---: | ---: | ---: |
| Control `f0622a9c` | Ubuntu | 5,215 | 5,177 | **35** | 3 |
| Control `f0622a9c` | Windows | 5,215 | 5,170 | **35** | 10 |
| Candidate `602dbc57` | Ubuntu | 5,215 | 5,199 | **13** | 3 |
| Candidate `602dbc57` | Windows | 5,215 | 5,192 | **13** | 10 |

[Full control **45148261520**](https://github.com/FlareZ123/obfs/actions/runs/45148261520) and [full candidate **45148194710**](https://github.com/FlareZ123/obfs/actions/runs/45148194710) both **RED** on both OS due to the behavioral/adversarial suite. The candidate resolves exactly **22** named failing assertions on each platform, without introducing another named failure in this finite pair. The resolved set comprises 12 new class positives, six new public-wrapper positives, two original COO/SNO private-class positives, and two original private-reader positive assertions. Three focused candidate workflows ([45148018107](https://github.com/FlareZ123/obfs/actions/runs/45148018107), [45148027172](https://github.com/FlareZ123/obfs/actions/runs/45148027172), [45148034701](https://github.com/FlareZ123/obfs/actions/runs/45148034701)) were **GREEN on both OS**, including strict JSDoc.

Thirteen pre-existing failure names remain in both candidate and control: two primitive Blob positives; two bound-function hostile-source positives; two private ESM factory/interfile positives; private tuple session; SNO bound target interception; bound public export; static Symbol-key recovery; and three Symbol-key native/sample positives. A refusal to emit a transformation can be semantically appropriate when it would alter the source observed by a host; failing positive-yield assertions do not themselves prove an incorrect runtime result. The workflow's independent JSDoc, sampled performance, and Ubuntu Chromium checks ran without a failed step, but they are finite samples, not universal guarantees.

## Critical falsifier and public-source attack

An earlier permissive variant admitted any private helper called inside an exported wrapper. This was **unsafe** for:

```js
const owner={secretField:41};
function identity(input){return input;}
function published(n){return identity(owner).secretField+n;}
module.exports=published;
```

It renamed a member spelled inside publicly observable `published.toString()`. The source-pinned [red 45146511307](https://github.com/FlareZ123/obfs/actions/runs/45146511307) failed the identity-forwarding refusal in COO, SNO and SCO (3/27); the final candidate requires a primitive field-return reader, and the same adversarial test passes. The independent `sims/source-island-public-normalizer.js` still recovers every generated hashed field name in the exercised examples and builds a working source-only clone with no secret seed. **This proves no extra resistance over normal minification.**

## Decision

Keep the proof **isolated** pending independent source/host review and a truly green release gate. No production mainline merge or competing PR. Agent 10 owns full acceptance and independently investigated a narrower reader grammar; Agent 3 owns canonical ownership-proof intake. Both the identity-forwarding falsifier and the existing two-statement-arrow benchmark dependency were communicated. Threat-model-wide reconstruction resistance, SCO online attack resistance, COO/SNO integrity under hostile runtime control, and a universal **2.5×** compute ceiling remain unproved or blocked by [`results/README.md`](../results/README.md).

## Independent public-only static recovery and equal-trust minifier control

A new standalone adversarial test was committed **without changing production
compiler source** at
[`agent46/private-proof-public-recovery-20261123`](https://github.com/FlareZ123/obfs/tree/agent46/private-proof-public-recovery-20261123),
revision `8f1cede09960dc0a55b3a39b393e38c45ad03c23`, file
`test/private-proof-public-recovery.test.js`.

[Focused manual-validation run **45150271685**](https://github.com/FlareZ123/obfs/actions/runs/45150271685)
was **GREEN on both Ubuntu and Windows** (six cases on each, strict JSDoc green).
For every SCO/COO/SNO combination and both a private class method and a
private reader behind an exported public function, the test first requires
exactly **one rewritten private field**, then gives only delivered generated
bytes to an independent seedless static normalizer. The normalizer uses
neither the compiler parser, the original source, nor the seed, yet
reconstructs an executable same-output clone. An ordinary esbuild minifier
is an additional same-source functional control. In the exported reader
case, 513 distinct numeric inputs agree across native, generated, normalized
and minified implementations, and the public wrapper's callable source
remains identical.

| Fixture | Original bytes | esbuild minified | Obfuscated | Public normalized |
| --- | ---: | ---: | ---: | ---: |
| Private class method, numeric exported value | 135 | **101** | 139 | 161 |
| Private reader behind exported function | 145 | **106** | 149 | 171 |

All measured lengths were identical across the three obfuscation modes for
these exact configurations (`strings:false`, `identifiers:false`,
`properties:true`); these examples do not exercise SCO network interaction
or other mode-specific defenses. This provides a **concrete counterexample to
claiming any static-reconstruction advantage over ordinary minification from
these two property-name proofs alone**. It does not amount to a general
deobfuscator, complete attacker-cost benchmark, or argument that all
obfuscation techniques lack security value.

## Corrected paired post-initialization CPU experiment

A paired Node.js 22 hot-work experiment on the same two admitted proof
patterns (each **actually renaming one field**) is committed at
[`agent46/private-proof-public-recovery-20261123`](https://github.com/FlareZ123/obfs/tree/agent46/private-proof-public-recovery-20261123),
revision `d3753dc5c0fdd4d16e6946a1a4a6af354f101e97`, file
`test/private-proof-hot-budget.test.js`.
[Focused two-OS run **45150995933**](https://github.com/FlareZ123/obfs/actions/runs/45150995933)
was **GREEN on Ubuntu and Windows**, six tests per platform, with strict
compiler/external JSDoc checks. There are seven order-counterbalanced,
native/emitted CPU-time pairs per source pattern and mode; **84 total
paired observations**, with executed-call checksums and 2,049 held-out
input checks before measurement. The private reader receives three million
calls per sample; the optimized private class receives sixty million per
sample to exceed coarse Windows CPU-clock quanta.

| Source pattern | Mode | Ubuntu ratio of CPU medians | Windows ratio of CPU medians |
| --- | --- | ---: | ---: |
| Public wrapper → private reader | COO | 1.00870× | 0.99681× |
| Public wrapper → private class | COO | 1.00069× | 1.00000× |
| Public wrapper → private reader | SNO | 0.99442× | 1.00000× |
| Public wrapper → private class | SNO | 1.00719× | 0.94340× |
| Public wrapper → private reader | SCO | 0.99560× | 1.00000× |
| Public wrapper → private class | SCO | 0.99965× | 1.06400× |

The largest **individual** protected/native CPU ratio was
**1.20513×** (Windows SCO class), with **zero of 84** sampled pairs
strictly above **2.5×**. Full paired arrays and checksums are logged as
`PRIVATE_PROOF_PAIRED_HOT` in the exact run. This is a post-initialization
local compute profile; it excludes cold process startup, offline
transformation, SCO network response costs, and all workloads outside
these two straight-line shapes.

**Method correction:** The earlier
[run 45150708258](https://github.com/FlareZ123/obfs/actions/runs/45150708258)
used only three million calls for the optimized class source.
Windows CPU accounting reported 0ms for some class samples,
creating `Infinity` ratios that serialized as JSON `null`. These
ratios are **measurement artifacts**, not valid performance exceedances;
we preserved that receipt and corrected the fixture to use 60 million
calls for class profiles and assert both observed CPU times are strictly
positive. Both variants of the earlier run passed program equivalence,
but its class cost ratios cannot be used for the 2.5× claim.

Thus the repaired evidence supports budget compliance for **84 measured
hot paired executions** under these exact workload/runtime assumptions.
A universal worst-case 2.5× bound remains unproved.
