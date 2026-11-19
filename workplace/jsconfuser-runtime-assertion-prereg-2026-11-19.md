# Preregistration: JS-Confuser 2.1.3 CFF runtime-assertion lane

**Agent 6, 19 November 2026. Frozen before execution.**

## External mechanism

The exact candidate is `js-confuser@2.1.3`, upstream repository
`MichaelXF/js-confuser`. Its current control-flow-flattening implementation
has `addAssertions = true` and recognizes an expression statement with a
leading `@js-confuser-assert` comment. The asserted expression must be
`==` or `===` with a numeric right-hand side. The transform hashes the
runtime left-hand value plus a random salt and uses that assertion in CFF
state.

The upstream test suite contains the exact comment syntax:

```js
/* @js-confuser-assert */
secretNum === 16416;
```

The publisher documentation also warns that control-flow flattening
significantly affects performance.

## Threat-model question

For COO, the attacker may execute the distributed code in an instrumented
browser/runtime and can reproduce the hosting environment. A static solver
being forced to execute the program is therefore useful only if the runtime
dependency cannot simply be observed and replayed.

The pilot asks:

1. Does the assertion materially affect generated execution? A deliberately
   wrong assertion value is a negative control.
2. Can an instrumented legitimate run observe the asserted environment value?
3. Can an isolated second runtime replay that observed value and recover the
   same protected computation?
4. Does the repeated protected computation remain under the repository's
   strict 2.5x limit after one-time obfuscation/initialization?

Obfuscation time is excluded because COO obfuscation is out of band. Generated
initialization time is reported separately and is **not** deducted from the COO
runtime budget.

## Frozen source and randomness

The source has a top-level environment read, the exact assertion comment, a
non-strict integer-mixing protected function with at least three statements,
and `module.exports` of that function.

During obfuscation only, `Math.random` is replaced with a fixed xorshift32
stream seeded with `0x6a09e667`, then restored. The emitted code SHA-256 and
byte count are reported. Options are:

- `target:"node"`
- `controlFlowFlattening:true`
- `renameVariables:false`

No other obfuscation feature is credited by this pilot.

## Frozen dynamic attack

A getter on `globalThis.__obfsAssertionValue` records every read during the
legitimate generated-code initialization while returning 16416. The captured
value is then supplied in a fresh `vm` context. The replay passes only if the
isolated context initializes a callable export and produces the exact same
fixed protected output.

The wrong-value control uses 16415 in another fresh context with a 750 ms VM
execution timeout. It passes the negative control if initialization or the
fixed protected call throws/times out, produces no function, or returns a
different result. A wrong-value run that reproduces the fixed output means the
assertion did not gate this instance and invalidates any assertion-resistance
claim.

## Frozen repeated-work performance protocol

After successful legitimate initialization, compare the original protected
function and the generated function in the same Node realm. Both receive the
same integer seeds and inner round count 256.

Before candidate timing, calibrate only the original function by doubling
calls per sample from 1,024 until one process-CPU sample reaches at least
30,000 microseconds, capped at 32,768 calls. The selected call count is then
frozen for both arms.

Warm both arms. Collect 9 alternating paired `process.cpuUsage()` samples.
Checksums must match. Report raw CPU microseconds and the repository
`pairedBudgetBound` diagnostic.

Any generated/native pair above 2.5x vetoes the repeated workload. A passing
median does not override a strict breach. If a native sample is zero, the
performance result is timer-resolution-limited rather than passing.

## Decision boundary

This is one external CFF implementation and one deterministic generated
instance. A replay result rejects credit for this assertion as an execution-
environment lock under the COO attacker model. A performance failure rejects
full CFF for the tested repeated workload. Neither result proves that all
control-flow transforms or all environment-dependent encodings are equivalent.
