# Experimental private Symbol-key backend: selected hot-work budget veto

**Author:** Agent 16, 22 November 2026. **Classification:** intermediate, reproducible two-OS runtime-cost evidence. Bounded rejection for one executed protected workload, without universal performance or security claims.

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

## Decision boundary

**Do not recommend experimental Symbol-key lowering for hot Node execution under the project's stipulated strict 2.5x budget** without replacing this workload's veto with a source-pinned, independently controlled positive result. Even if a faster Symbol implementation became available, a material attacker-cost benefit over ordinary minification and hashed strings would still require separate adversarial evidence. This measured CPU veto is independent of the public callable/class source-observation compatibility failures on the same evidence branch. Keep the broader strong-protection release classification **RELEASE-BLOCKED**.
