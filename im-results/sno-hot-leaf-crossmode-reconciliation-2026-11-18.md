# Cross-mode strict SNO compute boundary exposes selected hot-leaf 18–36× overhead

**Agent 1, 18 November 2026 UTC. Classification: intermediate, source-pinned negative performance evidence and release-decision correctness work.** This is not a strong-obfuscation security result.

## Exact source and verification

[Manual Ubuntu/Windows cross-mode release workflow **44212314693**](https://github.com/FlareZ123/obfs/actions/runs/44212314693) ran at exact executable SHA **`aff2728c7c77ebad7856303cf62554bebb1ce832`** on **Node 22.23.4**. Both jobs passed strict external JSDoc, the amended test/release-evidence-gate.test.js unit suite, all original full adversarial applications, genuinely transformed SNO launcher, the new same-source resident work samples, and output artifact retention.

The prior [two-OS run 44211733905](https://github.com/FlareZ123/obfs/actions/runs/44211733905), SHA `83196fe127babed9a8a2a468e95e3ac25a6fbd37`, already independently demonstrated **52/52** strict post-init selected-function CPU violations in four OS/workload groups, but an initial reporting code version mistakenly excluded those leaf rows from the combined strict compute aggregation. The newer run fixes that decision-policy issue without changing the resident SNO workload or compiler backend. The original two source pins must remain distinct.

## Relationship to prior SNO evidence

This 12-population **cross-mode decision integration** is a new reporting and
measurement-join contribution. The hot-leaf weakness itself **was already
established independently by Agent 37** at source `4463cd675728bf5d9cd7fdec73426091cba4a9a0`
in [the earlier selected-hotpath veto](polyvariant-selected-hotpath-budget-veto-2026-11-18.md),
[run 44208868147](https://github.com/FlareZ123/obfs/actions/runs/44208868147):
the tested `experimentalPolyvariantAffine` count-2 backend showed 52/52
strict >2.5× selected-leaf CPU pairs across the same 40M/80M workload classes.
Our fully pinned reruns reproduce that negative result and prevent the
**cross-mode release aggregator** from admitting a low-overhead full
application while excluding protected selected work.

Agent 37 also investigated `experimentalPolyvariantCompact:true` in
[compact critical-path evidence](polyvariant-compact-critical-path-2026-11-18.md).
The compact variant reduced short-loop overhead to ~2× but still produced
strict violations in longer 200M/400M-run tests, including a Windows 400M
median ~2.76×; source-only static recovery of its arithmetic was trivial.
The present integration measures the **default full-affine** backend,
not the distinct compact candidate, and should not be read as a first
discovery or a new compact benchmark.

## Correct execution boundary

`sims/sno-resident-budget.js` builds the actual native and emitted three-module SNO ESM graphs; its protected entry verifies the SHA-256 manifest and imports once **before** READY. It checks three genuinely selected affine/polyvariant arithmetic functions and one genuinely rewritten module. Two persistent Node processes then repeat the application workloads, compare exact output digests and callback counts, and record both inside-worker wall duration and `process.cpuUsage()` user+system time around the *business computation only*. Startup, integrity verification, imports, IPC parsing and output hashing are excluded symmetrically. The selected-leaf branch in `sims/sno-resident-entry.cjs` directly calls the three genuine selected `round1/round2/round3` functions sequentially **40 million** or **80 million** times with equal seeds and original/published final digest parity.

This is the SNO post-initialization compute boundary permitted by the objective's exception. The existing `sims/polyvariant-app-sno.js --profile` fresh-process results remain in the report as **cold operational latency**, a separate descriptive measure.

## Measured post-init process CPU

Each table cell is the exact source run's ratio of protected/native CPU medians with 13 alternating-order pairs after warmup. Raw source-specific data are reproduced below for the two relevant selected hot-path populations.

| SNO work (one timed sample) | Ubuntu CPU ratio | Ubuntu strict >2.5× | Windows CPU ratio | Windows strict >2.5× |
| --- | ---: | ---: | ---: | ---: |
| 1 events × 50000 | 1.16563× | 0/13 | 1.15957× | 0/13 |
| 50 events × 2500 | 1.34486× | 0/13 | 1.12800× | 0/13 |
| 1000 events × 80 | 1.44254× | 0/13 | 1.31915× | 0/13 |
| 10000 events × 5 | 1.46709× | 0/13 | 1.65957× | 0/13 |
| Three direct selected leaves × 40000000 | 20.76020× | 13/13 | 24.43750× | 13/13 |
| Three direct selected leaves × 80000000 | 31.17079× | 13/13 | 33.25532× | 13/13 |

**Full application rows:** sample-supported on Ubuntu and sample-supported on Windows, with **0/104 strict CPU pair breaches** across the four workloads and two platforms. This does not imply the selected arithmetic is fast, because repeated scenario computation includes substantial untransformed work.

**Direct selected-function rows:** sample-exceeded Ubuntu and sample-exceeded Windows, with **52/52 strict CPU breaches and 52/52 strict wall breaches**. Protected 40M/80M outputs match native digests. These are actual repeated, selected protected functions, not merely extra optional cold-load overhead.

Node's [official process.cpuUsage documentation](https://nodejs.org/download/release/v22.17.0/docs/api/process.html#processcpuusagepreviousvalue) defines process user+system CPU in microseconds and notes multi-core CPU may exceed elapsed; each fixture uses separate persistent Node processes and synchronous selected JavaScript work. Windows CPU sampling is coarser and reports repeated values; paired wall measurements corroborate the large overhead.

## Cross-mode decision reconciliation

The amended `sims/release-evidence-gate.js` records two independent summaries at the same SHA:

- **Legacy ten-workload cold operational summary:** Ubuntu 10 strict >2.5× sampled pairs, observed max 4.27282×. Windows 9 strict pairs, max 3.19363×. Its SNO component includes new Node startup, and cannot alone establish violation of post-init compute.
- **Reconciled twelve-workload compute-boundary summary:** four COO native/published populations, four SNO resident application CPU populations, **two mandatory SNO resident selected-leaf CPU populations**, and two SCO authenticated service populations. Ubuntu 36 strict pairs, observed max 31.28450×; Windows 35 strict pairs, max 33.91489×. Both per-platform one-sided familywise median verdict and independently enforced `strictObservedVerdict` return **sample-exceeded**. Four direct selected hot loops contribute **26 strict pairs per OS**.
- **Security remains separately blocked:** the report's public-only COO/SNO functional recovery and permitted SCO same-account online output relay remain demonstrated in all three modes. Neither the SNO CPU measurement nor the aggregation changes that security evidence.

The familywise order-statistic diagnostic concerns population medians under independent representative within-workload samples; it cannot prove a future worst-case 2.5× guarantee. The strict sampled-pair veto explicitly records every observed breach even when median statistics would otherwise look favorable.

## Raw selected-function paired series


### Ubuntu: 40000000 direct-leaf iterations

- Native CPU median: 32.878 ms; published CPU median: 682.554 ms; ratio of medians: 20.76020×
- Native wall median: 32.865026 ms; published wall median: 682.569765 ms; ratio of medians: 20.76888×
- Strict CPU sample pairs above 2.5×: 13/13. Strict wall pairs: 13/13.

Raw data, same trial order:

```json
{
  "nativeCpuMs": [
    32.96,
    32.753,
    32.89,
    32.95,
    32.972,
    32.809,
    32.739,
    32.878,
    32.827,
    34.181,
    32.771,
    33.222,
    32.833
  ],
  "protectedCpuMs": [
    682.438,
    682.527,
    682.664,
    682.554,
    682.471,
    682.521,
    682.71,
    682.539,
    682.427,
    682.592,
    694.099,
    706.68,
    690.451
  ],
  "nativeWallMs": [
    32.953853,
    32.745902,
    32.884759,
    32.942516,
    32.96557,
    32.803247,
    32.733093,
    32.865026,
    32.820909,
    34.168739,
    32.765161,
    33.237194,
    32.826288
  ],
  "protectedWallMs": [
    682.456956,
    682.557747,
    682.725627,
    682.569765,
    682.524918,
    682.547521,
    682.736244,
    682.492449,
    682.354618,
    682.601016,
    688.111806,
    691.430356,
    683.397933
  ]
}
```

### Windows: 40000000 direct-leaf iterations

- Native CPU median: 32 ms; published CPU median: 782 ms; ratio of medians: 24.43750×
- Native wall median: 38.7899 ms; published wall median: 792.4212 ms; ratio of medians: 20.42854×
- Strict CPU sample pairs above 2.5×: 13/13. Strict wall pairs: 13/13.

Raw data, same trial order:

```json
{
  "nativeCpuMs": [
    32,
    31,
    31,
    47,
    31,
    63,
    31,
    46,
    32,
    32,
    46,
    47,
    32
  ],
  "protectedCpuMs": [
    813,
    781,
    781,
    782,
    781,
    782,
    781,
    797,
    797,
    781,
    797,
    796,
    813
  ],
  "nativeWallMs": [
    39.9783,
    40.9604,
    38.6373,
    38.7899,
    37.7695,
    57.1605,
    37.8251,
    47.1914,
    37.6156,
    33.8711,
    38.927,
    43.4636,
    25.2684
  ],
  "protectedWallMs": [
    824.8009,
    789.0785,
    786.0288,
    792.3753,
    788.323,
    795.3121,
    786.8383,
    792.7719,
    792.6364,
    792.4212,
    796.5374,
    796.498,
    789.7384
  ]
}
```

### Ubuntu: 80000000 direct-leaf iterations

- Native CPU median: 43.803 ms; published CPU median: 1365.374 ms; ratio of medians: 31.17079×
- Native wall median: 43.801551 ms; published wall median: 1365.425682 ms; ratio of medians: 31.17300×
- Strict CPU sample pairs above 2.5×: 13/13. Strict wall pairs: 13/13.

Raw data, same trial order:

```json
{
  "nativeCpuMs": [
    65.48,
    57.413,
    60.788,
    51.038,
    43.638,
    43.665,
    43.826,
    43.793,
    43.994,
    43.7,
    43.658,
    43.803,
    43.714
  ],
  "protectedCpuMs": [
    1366.351,
    1365.374,
    1364.853,
    1365.163,
    1365.193,
    1364.495,
    1367.27,
    1365.02,
    1365.796,
    1366.886,
    1365.651,
    1365.476,
    1364.09
  ],
  "nativeWallMs": [
    65.482233,
    51.061408,
    53.805021,
    43.853791,
    43.630683,
    43.65615,
    43.823276,
    43.790949,
    44.031903,
    43.69,
    43.650683,
    43.801551,
    43.714782
  ],
  "protectedWallMs": [
    1366.358866,
    1365.425682,
    1364.88796,
    1365.173881,
    1365.246989,
    1364.559047,
    1367.333306,
    1365.065688,
    1365.903892,
    1366.969029,
    1365.746546,
    1365.543716,
    1364.178295
  ]
}
```

### Windows: 80000000 direct-leaf iterations

- Native CPU median: 47 ms; published CPU median: 1563 ms; ratio of medians: 33.25532×
- Native wall median: 50.0011 ms; published wall median: 1577.772 ms; ratio of medians: 31.55475×
- Strict CPU sample pairs above 2.5×: 13/13. Strict wall pairs: 13/13.

Raw data, same trial order:

```json
{
  "nativeCpuMs": [
    47,
    62,
    47,
    47,
    47,
    62,
    47,
    47,
    62,
    47,
    63,
    47,
    47
  ],
  "protectedCpuMs": [
    1578,
    1578,
    1577,
    1594,
    1563,
    1562,
    1547,
    1578,
    1563,
    1578,
    1531,
    1563,
    1562
  ],
  "nativeWallMs": [
    49.9154,
    50.0028,
    49.9585,
    50.0011,
    49.9225,
    50.298,
    50.0577,
    50.0525,
    50.0103,
    50.4554,
    49.9573,
    49.9428,
    49.9495
  ],
  "protectedWallMs": [
    1577.772,
    1585.6175,
    1578.0702,
    1589.7003,
    1568.777,
    1576.247,
    1570.0623,
    1574.5153,
    1584.1938,
    1593.9289,
    1574.2973,
    1576.4024,
    1582.365
  ]
}
```

## Reproduction and release implication

Use exactly SHA `aff2728c7c77ebad7856303cf62554bebb1ce832` with Node 22 and the manual-only workflow `.github/workflows/manual-release-evidence.yml`. Both report types and raw series are in the retained `release-evidence-${{ runner.os }}` GitHub Actions artifacts; the cross-mode CLI produces `CROSS_MODE_RELEASE_EVIDENCE` followed by the complete machine-readable JSON.

**Decision: RELEASE-BLOCKED** for the measured selected affine/polyvariant SNO backend under the demanded 2.5× repeated-compute ceiling. The four application aggregates pass their finite scoped measurements, but the actual protected selected arithmetic violates with large margin. Do not promote a performance admission solely from application-level dilution, cold-start ratios or median-supported diagnostics. The result is not a formal impossibility proof for other obfuscator designs or different application workload distributions.
