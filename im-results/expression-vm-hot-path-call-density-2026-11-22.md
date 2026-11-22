# Expression-VM call-density performance against the 2.5x budget

**Agent 44, 22 November 2026. Intermediate performance evidence.**

## Finding

The checked-in expression-VM backend is correct on the tested sample, but it exceeds the project's 2.5x compute budget when invoked frequently. In the same 3-million-iteration workload, the VM/native runtime ratio is **5.575-6.625x at one call per iteration**, **2.885-3.367x at one call per eight iterations**, and falls below 2.5x at one call per sixteen iterations on both tested CI platforms.

The existing mixed-workload test's one-call-per-512-iterations point is valid for a cold/sparse workload, but it is not evidence that the VM is suitable for hot functions.

## Reproducible benchmark

The benchmark script `sims/expression-vm-call-density-benchmark.js` loads the checked-in native and generated modules directly:

- Native: `examples/expression-vm/before.cjs`
- VM: `examples/expression-vm/after.cjs`

It first checks 100,000 distinct Int32 inputs for exact equality. It then runs 3,000,000 outer iterations at each call period, with four warmups and seven alternating-order samples per point. Each iteration performs the same baseline accumulator work; the selected function is called at the requested frequency. The reported ratio is the median VM workload time divided by the median native workload time. No performance assertion is made; the script reports whether each point is within 2.5x.

Source-pinned workflow: [44974192395](https://github.com/FlareZ123/obfs/actions/runs/44974192395), head `6ea3b5929473ea6e987122e7c5229072e6d8570e`. Both Ubuntu and Windows jobs passed, including the focused expression-VM tests, 100,000-input differential check, browser parity test, and JSDoc typecheck.

## Results

<text>Node v22.23.5, V8 12.4.254.21-node.57, x64. Ubuntu runner CPU: Intel Xeon Platinum 8370C. Windows runner CPU: AMD EPYC 7763.</text>

| VM call period | Calls / 3M iterations | Ubuntu ratio | Windows ratio | 2.5x result on both |
|---:|---:|---:|---:|---|
| 1 / 1 | 3,000,000 | 6.625x | 5.575x | <badge color="danger">Exceeds</badge> |
| 1 / 2 | 1,500,000 | 5.420x | 4.931x | <badge color="danger">Exceeds</badge> |
| 1 / 8 | 375,000 | 3.367x | 2.885x | <badge color="danger">Exceeds</badge> |
| 1 / 16 | 187,500 | 2.295x | 2.011x | <badge color="success">Within</badge> |
| 1 / 32 | 93,750 | 1.698x | 1.555x | <badge color="success">Within</badge> |
| 1 / 64 | 46,875 | 1.387x | 1.272x | <badge color="success">Within</badge> |
| 1 / 512 | 5,860 | 1.030x | 1.034x | <badge color="success">Within</badge> |

The measured crossover for this sample lies between 1/8 and 1/16 call density on both platforms. This is a workload-specific observation, not a universal safe-frequency guarantee.

## Interpretation and decision

The VM dispatches a loop and switch for each binary operator, allocates a register array per call, and decodes the byte tape. For this six-operation expression, that overhead is unacceptable in a hot path. At 1/512 call density the surrounding loop dominates, hiding the per-call cost; at 1/1 the cost is visible.

The backend is already opt-in and the example README warns that frequent calls can exceed budget. The new benchmark makes that caveat measurable. Treat the current bytecode VM as a **cold-path-only experiment** unless the deployed workload is profiled and shown to stay within 2.5x. Do not enable it by default or cite the 1/512 result as a general performance pass. For hot paths, use an alternative backend or leave the function unobfuscated until a faster VM is demonstrated.

This is a single small expression on two Node 22 CI runners. It does not establish the overhead of every VM graph, browser engine, CPU, or workload; nor does it evaluate security strength. The separate blind LLM probe shows the tape itself was reconstructed in 21.594 seconds, so this backend currently has both a hot-path performance limitation and no demonstrated LLM-resistance advantage.
