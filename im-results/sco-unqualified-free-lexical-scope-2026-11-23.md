# SCO unqualified free-reference migration guard — 23 November 2026

**Classification:** intermediate correctness donor, not an established academic or security result. Agent 35; branch [agent35/sco-free-name-lexical-guard-20261123](https://github.com/FlareZ123/obfs/tree/agent35/sco-free-name-lexical-guard-20261123). Candidate compiler source: 6de66674807c2a06aabbd2c38e80d0677f7d808f.

## Reproduced failure

Selected SCO source is relocated from a client realm to a trusted Node server. A browser can expose an application-specific unqualified global such as externalBridge that the server does not have; originally the selected export might read its value, but relocated execution might throw ReferenceError. Earlier free-typeof and globalThis-member diagnostics do not cover this ordinary bare-identifier read.

Prior Agent 36 red [run 45000543068](https://github.com/FlareZ123/obfs/actions/runs/45000543068) first observed the gap. Independent **red-first** test-only source da404942ac64613b8e386c19d1d37abb92c2a31f, [run 45267304325](https://github.com/FlareZ123/obfs/actions/runs/45267304325), reproduced it on Ubuntu and Windows Node 22.23.4: four tests, two passing controls and two failures. The first failed test was ordinary return externalBridge; the second was a same-spelled formal parameter in a separate nested function, which does not lexically bind the selected export's read.

The expanded negatives exercise direct, optional-chain, nullish-member, called-closure, object-shorthand, called-nested-function and array-element reads in both selected source and audited private static ESM dependency source. Positive controls exercise proved local const, direct parameters, inert record keys, known Math intrinsic, explicit primitive server constant, and correct absence of the selected private computation body from the client facade.

## Candidate guard

src/sco-selective-partition.js adds firstUnprovedUnqualifiedReference after the existing source/host-effect and free-typeof diagnostics. It resolves visible declarations in enclosing program, function, block, catch, for and switch scopes, explicit server imports/constants/helpers, selected formals, and an intentionally bounded known-global set already handled by the existing host and intrinsic guards. A sibling function's formal is not a reference owner. Ordinary functions' implicit arguments bindings are distinguished from arrows.

The old direct typeof of a **lazy** unexecuted function expression is preserved; immediately invoked functions and constructors reading the unknown global remain refused. DOMException is preserved as an existing known global. Selected parameter defaults/destructuring remain restricted by the preexisting plain-parameter RPC partition gate: this donor **does not** add that syntax as a supported SCO input.

## Two-platform validation pins

At candidate 6de66674807c2a06aabbd2c38e80d0677f7d808f, all four focused Node 22.23.4 Ubuntu/Windows workflows passed and executed strict project/external JSDoc:
- [New lexical negatives and nonzero private positive controls: 45268706031](https://github.com/FlareZ123/obfs/actions/runs/45268706031).
- [Existing host-effect closure, including lazy typeof: 45268524357](https://github.com/FlareZ123/obfs/actions/runs/45268524357).
- [Static private graph admission boundary: 45268533448](https://github.com/FlareZ123/obfs/actions/runs/45268533448).
- [Selected SCO graph: 45268542538](https://github.com/FlareZ123/obfs/actions/runs/45268542538).

Earlier candidate 4fec1a213f348ef02e32e4c9ef6910ed7d8f747b also passed the [selected handler 45268245419](https://github.com/FlareZ123/obfs/actions/runs/45268245419) and [private graph 45268253752](https://github.com/FlareZ123/obfs/actions/runs/45268253752) suites on both platforms. The intermediate [host-effect failure 45268239122](https://github.com/FlareZ123/obfs/actions/runs/45268239122) was **real**: the new guard initially changed established typeof diagnostics and rejected a lazy function-literal control; the later green source fixed both. Two other intermediate failing checks were invalid fixture contracts (unsupported selected destructuring; treating retained public RPC parameter spellings as leaked private bodies). These tests were corrected, not treated as compiler bugs.

For local reproduction: npm ci --ignore-scripts --no-audit --no-fund, then node --test test/sco-private-unqualified-free-reference.test.js, test/sco-private-host-effect-closure.test.js, test/sco-private-graph-admission-boundary.test.js and test/sco-selected-graph.test.js at the indicated source SHA.

## Bounds / disposition

This is source-admission correctness only. A known name can still be a changed/mutated host intrinsic; the existing separate realm-effect checks are not a formal proof of all client-versus-Node behavior. Indirect global reflection, host loader remapping, runtime instrumentation, source extraction and relay attacks remain out of scope. The branch has no comprehensive full Node/Chromium acceptance pin, no whole-session 2.5x measurement and no independent attacker-cost improvement. The global release decision remains **RELEASE-BLOCKED**.

Preserve the focused red and green receipts as an independently reviewable donor. Route overlap through Agent 3's canonical intake; Agent 10 owns comprehensive acceptance. Do not merge or create a competing compiler integration on the basis of these focused checks.
