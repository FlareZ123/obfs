# SCO detached in-flight authorization and response scope (17 November 2026)

**Status:** Intermediate trusted-server correctness regression with independently
pinned red and green CI. This is **not** a cryptographic anti-cloning result,
tamper-resistance proof, or general 2.5× full-application benchmark.

## Observed fault

The trusted SCO HTTP handler in `src/sco.js` delegates its policy checks and
private operation to an optional integrator-provided `runRpcIsolated(request,
execute)`. Before this change, the handler prevented an `execute` callback
from being first invoked after its isolation scope ended. A faulty integrator
could nevertheless **invoke it while the scope was open, return before awaiting
it, and allow the authorized continuation to run private work after scope
closure**.

With the `authorizeRpc` or `authorizeOperation` callback suspended on a
controlled promise, a real HTTP client received **HTTP 200 with private output**
after the faulty wrapper had returned. The intended generic HTTP 500 and
no-private-work negative control failed on **both** Linux and Windows:

- Immutable red source `07c16b6fec2412e6cdf2d5696c563ce020c1476a`.
- [Manual SCO authorization run 43994695375](https://github.com/FlareZ123/obfs/actions/runs/43994695375):
  **2 failures per OS**, both specifically the added detached-policy cases;
  **158/160 passed on Ubuntu**, **157/160 passed and one skipped on Windows**.
- Real test `test/sco-rpc-isolation.test.js`, cases beginning
  `SCO refuses detached isolation execution across pending authorizeRpc`
  and `...authorizeOperation`. Both compared exact JSON, HTTP status,
  execution-settlement status, and protected-method invocation count.

The bad wrapper is intentionally **outside the documented API contract**.
This issue matters because an integrator bug can otherwise turn a declared
lock-scoped policy boundary into unscoped execution.

## Fix and evidence

The handler now retains a one-way scope lifetime, checking it after each
asynchronous coarse, operation, and inner batch authorization, immediately
before invoking the protected method, and after it resolves but before sending
its result. It separately verifies that the `execute()` promise settled before
the isolation wrapper returned and that a completed wrapper produced an HTTP
response. Failures remain generic HTTP 500 and do not expose private exceptions.

- Fix `07bf8359356c9a4f9caf9fd9b6b118e65c9341bd`.
- [Pinned patched run 43994866799](https://github.com/FlareZ123/obfs/actions/runs/43994866799)
  passed the original two regressions, targeted SCO suite, strict JSDoc
  checks and other SCO workflow steps on Ubuntu and Windows.
- Extended tests `ccef38fed6bd773674ac66e341e720f237f411f9`
  add (a) a wrapper that awaits and suppresses a private exception, and
  (b) a private method already running when the wrapper returns.
- [Pinned extended run 43995049755](https://github.com/FlareZ123/obfs/actions/runs/43995049755)
  completed successfully on both OSes at exactly that source:
  **162/162 tests passed on Ubuntu**; **161 passed, one skipped, zero failed
  on Windows**. Both type-check and sampled SCO workflow steps completed
  successfully.

To reproduce at any pinned SHA, check out the exact commit, install the
repository's declared Node.js 22 dependencies and run

```powershell
node --test test/sco-rpc-isolation.test.js
npm run typecheck
```

The full pinned workflow includes additional HTTP, private-source,
authorization, Chromium (Ubuntu), performance, and strict JSDoc checks.

## Residual and performance scope

An application-supplied wrapper that allows execution to begin, releases its
lock, then returns while **the private method is already executing** cannot
make those side effects disappear. The extended positive residual test proves
that the private method starts once, while the handler withholds its eventual
result after the isolation scope expires. Authorization callbacks may have
their own irreversible effects; a late check does not undo them. Integrators
must still await `execute()` once and retain the appropriate transaction
or mutex until completion.

The documented mitigation does not authenticate clients, withhold new client
source, limit unlimited legitimate oracle queries, or prevent relay. The
modified handler performs small constant-time lifetime checks per RPC.
Existing SCO performance samplers ran in the green workflows, but neither
an independent before/after distribution nor a universal 2.5×
application-level bound was established. A representative short/fine-grained
RPC workload remains a known budget risk.

The relevant contract is in `docs/SCO_AUTHORIZATION.md`, section
"Concurrent authorization and RPC isolation".
