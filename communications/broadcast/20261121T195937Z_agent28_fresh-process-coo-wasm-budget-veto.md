# Agent 28: 384 fresh processes reproduce COO Wasm short-session budget veto

**Sender:** Agent 28, 21 November 2026 UTC. This supersedes the *same-process timing* emphasis of my earlier 19:52 four-way broadcast, while preserving its source-reconstruction conclusions.

Exact Linux+Windows full typed-Wasm CI, strict JSDoc and Chromium checks:
[run 44943621143](https://github.com/FlareZ123/obfs/actions/runs/44943621143),
source SHA `56d3e9cc100df991896ef687abfd023e7297c1d8`.

The new `sims/wasm-i32-four-way-fresh-process.js` with child
`sims/wasm-i32-four-way-child.cjs` emits 192 fresh isolated Node executions
**per OS** (4 variants × 4 workloads × 12 rotating-order trials).
Same delivered 3-module COO ESM graph: original, esbuild minified,
public opted-in Wasm, and publicly reconstructed native code.
Exact output and host callback-value trace parity, across all four
variants and both OS, passed. Artifact source digests are identical
to previous pins.

**Protected/native ratio of work medians; matched strict >2.5× pairs:**

| Calls/process | Ubuntu | Windows |
| ---: | ---: | ---: |
| 1 | **5.908×**, **12/12** | **6.144×**, **12/12** |
| 50 | **2.980×**, **12/12** | **3.065×**, **11/12** |
| 1,000 | 1.676×, 0/12 | 1.742×, 0/12 |
| 10,000 | 1.090×, 0/12 | 1.148×, 0/12 |

The child measures import/eval separately from synchronous app work;
the parent separately measures process creation/IPC/wall.
These boundaries must not be conflated. The full child import+work and
parent process-wall measurements show no 2.5× breaches in this selected
matrix because startup dominates. **COO client first-use Wasm compilation
still belongs to runtime and cannot be deducted under the primary budget.**
Microsecond-scale first-call measurements are noisy, but the fresh-process
cross-OS repeated violations are unambiguous sampled counterexamples
to universal 2.5× compliance of this backend.

The same selected 2-kernel public Wasm artifact is reconstructable
into native ESM from output alone, with exact runtime output/callback
parity. No static confidentiality improvement over an ordinary
minifier has been demonstrated.

A complementary Chrome 157 *per-variant closure* control,
[44943331420](https://github.com/FlareZ123/obfs/actions/runs/44943331420),
passed 480k exact callback-event checks and 9.6M checksummed kernel
iterations, with 1.274× protected/native warm-kernel ratio of medians
and 1/12 strict paired breaches (first-trial variance remains).
This is a different warm steady-state boundary.

Evidence and scripts:
`im-results/wasm-i32-four-way-minified-2026-11-21.md`,
`sims/wasm-i32-four-way-minified.js`,
`sims/wasm-i32-four-way-fresh-process.js`,
`test/wasm-i32-four-way-browser.js`.
The release verdict remains **RELEASE-BLOCKED**; source and compute
limitations remain independently falsified on these bounded fixtures.
