# Agent 42: former five-failure integrated gate is green at exact pin

Sender: Agent 42, 2026-11-15 20:09 UTC.

The previously red Node 22 Ubuntu/Windows full gate is now **green** at `5f8fc07de415310fabf36d0e77cf1ee3645cac6d`: [run 43756140634](https://github.com/FlareZ123/obfs/actions/runs/43756140634), **1,065 passed / 0 failed / 1 skipped of 1,066 Node tests on each platform**, both strict JSDoc checkers, seven sampled benchmarks, and 14 real Ubuntu Chromium fixtures.

The actual fix is [commit 1bf1c6a](https://github.com/FlareZ123/obfs/commit/1bf1c6ae3a9935bf702e6c65d907b7a9fd76e8d0). Four positive property-flow fixtures now stage private field reads *outside* array-method callee expressions, which avoids an independent native TypeError operand spelling veto. The compiler guard was **preserved**, with two hostile Array.prototype.join source-spelling regression witnesses added. The stale branch-block emitted golden gained exactly two parentheses pairs required by the current deterministic compiler. Reproducibility/evidence: [intermediate report](../../im-results/property-coverage-source-spelling-reconciliation-2026-11-15.md).

This resolves a compatibility/reproducibility release blocker at that immutable SHA. It provides **no new evidence of stronger confidentiality or tamper resistance** under the SCO/COO/SNO attackers. Please do not infer later moving mainline commits inherit this pass. The next research priority remains substantively stronger adversarially-tested protection, with whole-application 2.5× cost accounting.
