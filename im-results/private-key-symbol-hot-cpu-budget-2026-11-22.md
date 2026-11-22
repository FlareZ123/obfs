# Loader-dependent private Symbol-key hot-work cost: corrected runtime scope

**Author:** Agent 16, 22 November 2026. **Classification:** intermediate, reproducible cross-loader CPU and browser wall-cost evidence. **Erratum:** original synthetic-loader Node-wide veto was overgeneralized; see below.

## Critical erratum: dynamic Function versus native Node module loaders

**The earlier recommendation to reject the Symbol-key backend for all Node/SNO hot work was unsupported.** The first Node22/Node24 and SNO-compiled measurements were performed by a custom harness that executes generated source via `new Function('module','exports',source)`. It genuinely finds ~4x to ~5x CPU overhead in **that dynamic Function execution environment**. The harness bypasses the real Node `require()` loader and cannot by itself establish the performance of a deployed pre-obfuscated CommonJS entry point. The Chrome result already suggested execution-context sensitivity; independent native Node loaders now confirm it.

Frozen, **genuinely native module** comparisons, with the same private numeric owner algorithm, two actual hashed or Symbol rewrites, 15m warm calls/arm, 2m cross-callable preconditioning calls/variant, seven 25m hot paired samples and exact checksums:

| Source format and loader, Node 22.23.4 | Ubuntu generated Symbol median process CPU | Windows | Strict >2.5x CPU pairs per OS |
| --- | ---: | ---: | ---: |
| **Native ESM `import()`**, fresh unique query module instances | **1.00744x** | **1.00000x** | **0/7 and 0/7** |
| **Native CommonJS `require()`**, cache cleared before fresh module load | **0.99747x** | **1.00641x** | **0/7 and 0/7** |
| **Synthetic `new Function` source loader** (historical long-warm) | **4.10000x** | **4.15426x** | **7/7 and 7/7** |

Source-pinned native ESM [run 45084944699](https://github.com/FlareZ123/obfs/actions/runs/45084944699), SHA `2711b385a48b2fc4c735f174f19a4a25cb6dcdce`, raw [Ubuntu ESM](raw-private-key-hot-cpu-node-esm-2026-11-22-ubuntu.json) and [Windows ESM](raw-private-key-hot-cpu-node-esm-2026-11-22-windows.json). Source-pinned native CJS `require()` [run 45085075427](https://github.com/FlareZ123/obfs/actions/runs/45085075427), SHA `0df7bd788db702c42316749daeb63f2e7a6ee83c`. An initial real-require harness used a one-byte-different input and a different property salt; that exploratory result is superseded by the **byte-for-byte source and seed matched CJS rerun**, exact SHA `58f331beab69504e3821adae7191c8af1915d944`, [green Ubuntu/Windows run 45085202016](https://github.com/FlareZ123/obfs/actions/runs/45085202016). Both original SHA-256 `78e2bcc8a46a60865d091dcdae6fa390bfba6ed02477ac48f61660f7154548f0` and generated Symbol SHA-256 `b2c13f4d0e1e39bc2f8dded027228543d88b76bedf0cf71c201da5cd7810e20d` exactly match the earlier synthetic loader's protected executable bytes, including its hashed-string and handwritten Symbol variants. The matched real-`require()` Symbol CPU median was **1.00182x Ubuntu and 1.00000x Windows, 0/7 breaches on both**, while the byte-identical synthetic loader measured **4.10000x and 4.15426x, 7/7 breaches each**. [Ubuntu raw matched `require()`](raw-private-key-hot-cpu-node-require-matched-2026-11-22-ubuntu.json) and [Windows raw matched `require()`](raw-private-key-hot-cpu-node-require-matched-2026-11-22-windows.json) preserve all samples and hashes. The two independent native loader results already refute an unqualified **universal Node Symbol cost** statement.

Node's [official ESM documentation](https://nodejs.org/api/esm.html#urls) states modules with different import queries get separate instances, supporting the use of fresh numeric owner state per paired trial. Real CommonJS uses `require()` and clears `require.cache[require.resolve(path)]` between trials. **Measured loader behavior is a necessary premise of any performance admission**. Native module results are process CPU measurements; the Chrome result below is browser wall only.

The historical `new Function` measurements and raw arrays remain reproduced *as an explicitly bounded counterexample for a dynamic-evaluation runtime*. They must **not** be promoted as a general backend or SNO deployment veto. The earlier 23:22 and 23:38 broad broadcasts have been explicitly superseded by `communications/broadcast/20261122T2348Z_agent16_dynamic-function-cpu-confound-correction.md`.

## Frozen experiment

**Compiler/harness SHA:** `6bca25617b53e12e5e0897c9998477ddb6c4f96d`, branch `agent16/cjs-exported-class-source-20261122`. Test: `test/private-key-hot-cpu-control.test.js`. [GitHub Actions run 45082708695](https://github.com/FlareZ123/obfs/actions/runs/45082708695), with both Ubuntu and Windows Node **22.23.4** focused jobs green, including project and external strict JSDoc. The test intentionally logs cost violations rather than failing the test runner on a measured budget breach. True performance admission should reject strict >2.5x observations.

Original 163-byte module:

```js
'use strict';
const owner={acc:5,step:3};
function hidden(x){owner.acc+=((x&7)+owner.step);return owner.acc|0;}
module.exports=function compute(x){return hidden(x);};
```

The benchmark compiles the actual file in COO mode with `properties:true, identifiers:false, strings:false`. It **requires exactly two proven private owner-field rewrites** for both the hashed-string and `experimentalSymbolKeys:true` generated output; otherwise its semantic preflight fails. The public export is a wrapper delegating to a private helper, and each call returns a primitive numeric value. This narrow workload does not establish source confidentiality against a filesystem/runtime-controlling adversary.

For each protected version and comparator, the test verifies 10,000 sequential calls match the original. It then loads the original and alternate sources independently in one process, warms **1,000,000** calls per arm, measures **25,000,000** real calls per arm, and alternates native/emitted execution order across **seven pairs per variant**. It retains per-pair XOR checksums and requires exact equality. `process.hrtime.bigint()` measures wall time and `process.cpuUsage()` measures process user+system CPU. The interval excludes compiler, loading and initial warm-up costs, so it is selected repeated hot-work evidence, with no claim to COO cold-start or complete session compliance.

The six executed comparator arms were original 163 bytes, project hashed strings 210 bytes/two renamed keys, project unregistered Symbols 299 bytes/two renamed keys, handwritten Symbols 224 bytes, handwritten computed-string keys 221 bytes, ordinary **esbuild 0.28.2** minification 152 bytes, plus the identical-code placebo as the sixth comparison to original. Handwritten/minified comparator arms have zero compiler property rewrites because the project compiler was not applied to them. Esbuild used `transformSync` with `loader:'js',platform:'node',target:'node22',minify:true`. The esbuild arm is same-trust numeric runtime comparison, without asserting exact public callable source string preservation.

## Frozen paired CPU results

| Variant | Ubuntu median CPU ratio | Windows median CPU ratio | Strict >2.5x CPU pairs, Ubuntu/Windows | Protected keys |
| --- | ---: | ---: | ---: | ---: |
| Generated hashed-string | 1.00482x | 1.13636x | 1/7, 1/7 | 2 |
| Generated unregistered Symbol | **4.04339x** | **4.48936x** | **6/7, 6/7** | 2 |
| Handwritten Symbol | **4.13857x** | **3.70000x** | **6/7, 6/7** | 0 |
| Handwritten computed-string | 1.08931x | 1.14679x | 0/7, 0/7 | 0 |
| Ordinary esbuild minified | 1.00159x | 0.98936x | 0/7, 0/7 | 0 |
| Identical-source placebo | 1.00109x | 1.00000x | 0/7, 0/7 | 0 |

Independent wall-clock ratios point in the same direction: the generated Symbol median was **4.04108x Ubuntu / 4.03311x Windows**. All 42 pairs per OS had positive CPU denominators and checksum equivalence. Both generated Symbol and handwritten Symbol exceeded 2.5x in six of seven pairs on both platforms, while ordinary computed-string keys were near 1.1x and the equal-trust esbuild and placebo arms near 1x. This supports a **V8 computed Symbol property-key cost on this workload**, beyond a general object-indirection cost, while leaving causality at larger code/engine scale unproved.

The *first* pair of generated hashed strings showed one strict >2.5x violation on both OSes despite the remaining six sampling near 1x; the first Symbol pair was unusually faster than native before six subsequent pairs stabilized near 4x. These JIT/warm-up phase effects are important. Under the project's strict **every sampled pair** criterion, the hashed-string early outliers cannot simply be omitted. Longer warmups, fixed process placement and fresh-process negative controls would be valuable for attribution. The repeated six-of-seven Symbol breaches support a narrower unambiguous **selected hot-work budget veto** for this particular source. No universal statement about JS Symbol speed follows.

An independent earlier three-arm source pin, `230adad030afb5ef93f715c4a2292cb7139e82d9`, [run 45082517817](https://github.com/FlareZ123/obfs/actions/runs/45082517817), measured generated Symbol median CPU **4.64791x Ubuntu and 4.15426x Windows**, again six of seven strict breaches per OS, with native/placebo and hashed-string medians around 1x. Because the experimental pins differ, the two independent runs must not be pooled as if they shared one source snapshot.

## Raw machine-readable evidence

- [Ubuntu initial three-arm samples](raw-private-key-hot-cpu-2026-11-22-ubuntu.json)
- [Windows initial three-arm samples](raw-private-key-hot-cpu-2026-11-22-windows.json)
- [Ubuntu complete six-arm raw samples](raw-private-key-hot-cpu-equaltrust-2026-11-22-ubuntu.json)
- [Windows complete six-arm raw samples](raw-private-key-hot-cpu-equaltrust-2026-11-22-windows.json)

Each record includes the exact repository SHA and CI run, input/output SHA-256 and byte lengths, measured CPU/wall time and checksums for *every* sampled pair, ratio and budget counts. Verify the raw arrays rather than relying on this synthesis.

## Distinct real Chromium ESM wall-clock control

An independent **browser-target** experiment reached a different, engine-scoped conclusion. The first [Chromium run 45083087845](https://github.com/FlareZ123/obfs/actions/runs/45083087845) at source `e7b1067c0be8c411b2bc2f480acc54064a8c6392` used Chrome's `--virtual-time-budget` with `--dump-dom`. Although functional checks and JSDoc passed, the virtual clock did not advance for most long synchronous loops, producing `NaN`-derived JSON `null` timing ratios. **All first-run performance measurements are rejected**. No zero-breach assertion is based on them.

The revised test `test/private-key-hot-cpu-browser.js` uses `puppeteer-core` to load real network-served, CSP-restricted ESM modules into a real **Google Chrome 157.0.8103.78** process. It captures results through the browser automation session without virtual-time flags, and fails closed for nonfinite or zero measured ratios. Exact source `ec6c6a46ff022546a27de5040a117b29d0238ee3` and [Ubuntu/Windows symbol workflow 45084154048](https://github.com/FlareZ123/obfs/actions/runs/45084154048) **passed**. The actual hot runtime test runs on Ubuntu; Windows performs the other symbol workflow validations and strict types. The input is a separately compiled **154-byte ESM form** of the same private two-mutable-field numeric algorithm, with two actual hashed or Symbol compiler rewrites. Browser input/output checksums match across all six arm comparisons and **all 42 real measured pairs**.

Each browser pair imports independent native and alternate ES modules from live HTTP endpoints, warms each for 1,000,000 calls, and times 15,000,000 synchronous calls using the browser's real `performance.now()` clock, with seven alternating-order pairs per variant. The interval excludes network startup and import initialization. **Browser wall clock, not browser CPU**, is sampled.

| Browser variant, relative to native ESM | Chrome 157 median measured hot wall ratio | Strict >2.5x wall-clock pairs |
| --- | ---: | ---: |
| Compiler hashed-string keys, two genuine rewrites | 1.00000x | 0/7 |
| Compiler unregistered Symbol keys, two genuine rewrites | **0.99762x** | **0/7** |
| Handwritten Symbol computed keys | 1.00000x | 0/7 |
| Handwritten computed-string keys | 1.00000x | 0/7 |
| Ordinary esbuild minification | 1.00000x | 0/7 |
| Byte-identical placebo | 0.99762x | 0/7 |

[Raw exact browser source, checksum, and all paired timing evidence](raw-private-key-hot-chromium-2026-11-22-ubuntu.json) is source-pinned to that workflow. One initial hashed-key pair had 2.13527x wall ratio, below the strict limit; later samples were near 1x. Typical hot samples took about 84 milliseconds for 15 million calls, and the ratios are finite and positive. The browser engine/version and measurement semantics differ from the Node 22.23.4 process CPU experiment, so **the Node Symbol CPU veto remains valid for its workload and runtime while this selected Chrome 157 wall-clock result does not show the same slowdown**.

This distinction is evidence that the particular cost is sensitive to engine/runtime environment. A strong release-grade cross-target decision still needs browser CPU, full end-to-end session cost, cold start including COO initialization, and independent reconstruction resistance. Neither result can be substituted for the other.

## Repeat with longer warm-up and preconditioned polymorphic callsites

The initial seven-pair Node sample set contained first-pair phase changes for both ordinary hashed-string and Symbol variants. A controlled follow-up extended every arm's warm-up from 1 million to **15 million calls** and primed the shared `work()` callsite with an additional **2 million invocations per alternate callable shape** before any timed pair. All timed samples still executed 25 million hot calls per arm, with independent fresh module state, native/alternate checksum equivalence, alternating order, the six same-trust comparators, and both strict JSDoc configurations.

**Exact source pin** `ec6c6a46ff022546a27de5040a117b29d0238ee3`, [Ubuntu and Windows green focused run 45084162697](https://github.com/FlareZ123/obfs/actions/runs/45084162697), Node 22.23.4. All CPU denominators were positive and every native/emitted checksum matched.

| Variant | Ubuntu longer-warm CPU median | Windows longer-warm CPU median | Strict >2.5x CPU pairs, Ubuntu/Windows |
| --- | ---: | ---: | ---: |
| Generated hashed-string, 2 protected keys | 0.99939x | 1.00000x | **0/7, 0/7** |
| Generated unregistered Symbol, 2 protected keys | **4.10000x** | **4.15426x** | **7/7, 7/7** |
| Handwritten computed Symbol | **4.13441x** | **4.17112x** | **7/7, 7/7** |
| Handwritten computed string | 1.08333x | 1.07979x | 0/7, 0/7 |
| Ordinary esbuild minified | 1.00164x | 1.00000x | 0/7, 0/7 |
| Same-code placebo | 0.99905x | 1.00535x | 0/7, 0/7 |

Raw records: [Ubuntu](raw-private-key-hot-cpu-longwarm-2026-11-22-ubuntu.json) and [Windows](raw-private-key-hot-cpu-longwarm-2026-11-22-windows.json). Each preserves all 42 CPU/wall time pairs and checksums per OS, warm and preconditioning call counts, actual rewritten-key metrics, and artifact SHA-256/lengths. The longer-warm intervention eliminated the first-pair *hashed-string* strict breaches while the generated and independent handwritten Symbol arms each exceeded the project budget in **all** seven pairs on both OSes. This provides a stronger workload-specific Symbol CPU veto with an ordinary hashed-string positive counterpart. It does not retroactively erase the earlier observed first-pair violations, which remain part of the record for their explicitly shorter warm-up conditions.

## Node 24 cross-version reproduction

To separate the browser/Node difference from a simple comparison between old and current Node versions, the **same executable benchmark** and six selected controls were run under the newer Node **24.22.3**, using a focused workflow input that changes only `actions/setup-node` for the focused job. Original/hashed/Symbol source SHA-256 and byte counts remain those of the longer-warm Node22 fixture; the executable test source and 15m warm/2m preconditioning/25m timed calls did not change. Exact workflow/runner SHA `4b1623d4c9af8dcf28a9bd760d934e32b720379c`, [both-OS green run 45084562549](https://github.com/FlareZ123/obfs/actions/runs/45084562549), including project and external strict JSDoc.

| Same hot numeric owner and backend | Ubuntu Node 24 median CPU | Windows Node 24 median CPU | Strict >2.5x CPU pairs, Ubuntu/Windows |
| --- | ---: | ---: | ---: |
| Generated hashed-string, two real rewrites | 0.98998x | 1.00000x | 0/7, 0/7 |
| Generated unregistered Symbol, two real rewrites | **4.63463x** | **3.65957x** | **7/7, 6/7** |
| Handwritten computed Symbol | **4.57235x** | **3.62400x** | **7/7, 7/7** |
| Handwritten computed string | 1.10241x | 1.12000x | 0/7, 0/7 |
| Ordinary esbuild minified | 1.00581x | 1.00000x | 0/7, 0/7 |
| Byte-identical placebo | 0.99924x | 1.00000x | 0/7, 0/7 |

Exact per-sample logs: [Ubuntu Node24](raw-private-key-hot-cpu-node24-2026-11-22-ubuntu.json), [Windows Node24](raw-private-key-hot-cpu-node24-2026-11-22-windows.json). Windows has one generated Symbol pair ratio **2.38424x** below the strict 2.5x line, while all others breach. The two Node versions reproduce the same *large* selected-work slowdown, whereas Chrome 157's separately verified **wall-clock** ESM test shows near-1x. This is an **engine and host configuration difference** requiring additional investigation, with no evidence sufficient to assign a specific JIT optimization cause. It reinforces avoiding a global claim that one measured engine's backend performance automatically transfers to all JavaScript targets.

## Selected SNO compiler-output hot-work comparison

The same longer-warm private-owner harness also compiled the authentic numeric CJS source with **`mode:'sno'`** (server-only no-control), preserving `strings:false,identifiers:false,properties:true` and both required actual own-key rewrites. A dedicated test wrapper `test/private-key-hot-cpu-sno.test.js` selects SNO while executing compiled code inside Node using the shared microbenchmark loader. This is **SNO compiler-output hot computation evidence**, not an end-to-end pre-obfuscated multi-file server deployment, filesystem-integrity test or lifecycle evaluation.

Exact source `c427e6297a06dac3165cd8114bd9e63820e613e2`, [Ubuntu/Windows Node22 green run 45084750154](https://github.com/FlareZ123/obfs/actions/runs/45084750154), after 15m warm/arm, 2m polymorphic preconditioning per variant and seven 25m hot-call pairs. Every checksum matched native and both strict JSDoc gates passed.

| SNO compiled variant | Ubuntu Node22 CPU median | Windows Node22 CPU median | Strict >2.5x CPU pairs, Ubuntu/Windows |
| --- | ---: | ---: | ---: |
| Two genuine hashed-string owner rewrites | 1.00140x | 0.99091x | 0/7, 0/7 |
| Two genuine unregistered Symbol rewrites | **5.08921x** | **3.98182x** | **7/7, 7/7** |
| Handwritten computed Symbol | 5.17073x | 3.87156x | 7/7, 7/7 |
| Handwritten computed string | 1.04519x | 1.14679x | 0/7, 0/7 |
| Ordinary esbuild minified | 1.00431x | 1.00000x | 0/7, 0/7 |
| Same-source placebo | 1.00198x | 1.00000x | 0/7, 0/7 |

The SNO-compiled output preserves the selected repeated-work Symbol CPU slowdown **only inside the synthetic dynamic-Function loader** used by this test. This is not representative of real SNO §require()§ entry execution without a matched native-loader control. Raw [Ubuntu SNO](raw-private-key-hot-cpu-sno-2026-11-22-ubuntu.json) and [Windows SNO](raw-private-key-hot-cpu-sno-2026-11-22-windows.json) contain the full matched samples and exact generated SHA-256. Cross-run **relative medians** should not be interpreted as a direct randomized comparison between COO and SNO modes, since their own-key output salts and CI runner conditions differ. The valid conclusion is **both SNO-compiled Symbol variants exceeded 2.5x inside this synthetic dynamic loader** on Node22 runners; this is insufficient to infer a real SNO deployment violation. The allowed SNO initialization exemption cannot deduct actual repeated hot work, but the runtime loader premise must first be validated.

**Causal limitation:** The two harnesses differ in their loader **and** the surrounding `work()` benchmark implementation and callsite compilation. Matching the protected input and emitted code bytes eliminates a critical source confound, and the two real native module loaders independently pass, but it does not isolate a unique V8 mechanism. Attribute the discrepancy to the **execution/benchmark environment** pending a single-function-controlled A/B that changes only the loader.

## Decision boundary

**Loader-specific admission replaces the prior blanket Node Symbol veto.** Ordinary generated hashed keys and generated unregistered Symbol keys both satisfy the observed hot CPU ceiling in the tested genuine Node 22 ESM and CommonJS loaders, while computed Symbol keys violate the budget in the synthetic dynamic Function source-loader workload. Real Chrome 157 ESM wall-clock measurements are near parity, without establishing browser CPU or complete session bounds. The byte-identical `require()`/`new Function` comparisons are now independently source-pinned and exhibit **opposite hot-cost outcomes** despite identical protected bytes.

For production release, measure the actual loader, architecture and repeated workload against independent original and equal-trust minifier controls. Keep original raw negative samples to study optimization, but do not conflate a benchmark loader artifact with an intrinsic obfuscator runtime cost. **No material attacker-cost improvement** over minification has been established for Symbol keys; public-callable source-parity defects and the broader strong-protection **RELEASE-BLOCKED** classification remain unresolved.
