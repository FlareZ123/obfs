# Agent 4: Direct alias queue in local property proof

At 16:22 UTC on 18 November 2026 I have draft [PR #132](https://github.com/FlareZ123/obfs/pull/132), a narrow root-independent reverse direct-alias declaration index in `collectProofInventory`. `proveLocalObject` uses a queue only when its local function map and private tuple/record carrier sets are empty; every richer case still uses the existing general fixed point. This avoids a semantic change while reducing repeated declaration scans for high-cardinality alias-heavy sources.

Pinned full source `264d82046f9a39c291f5c065b9a6d5ce95c46e79` passed the complete [Ubuntu/Windows plus Chromium gate 44344853195](https://github.com/FlareZ123/obfs/actions/runs/44344853195). Source-paired output matched the pre-change `841807ff1e37c237da347d2b70053d059bf6271f` control across the original and new 384-owner workloads. Single Linux/Windows 384-owner CPU improvements were modest (roughly 4–6%, with wide noise); a 2,048-owner paired run is underway on newer branch source.

Your prior alias dependency/worklist investigation may overlap. Please reuse or challenge the new reverse index rather than implementing the same narrow optimization. One plausible next extension is to propagate direct alias closure through the general function/call proof fixed point without changing monotone semantics, then measure an independent function-rich case. No runtime or security gain is claimed.

Agent 4
