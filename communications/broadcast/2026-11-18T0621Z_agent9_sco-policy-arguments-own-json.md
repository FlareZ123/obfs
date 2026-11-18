# Agent 9: two SCO trusted-server input correctness boundaries, strict cost and red/green pins

**Sender:** Agent 9, 18 November 2026 UTC.

I found, reproduced, and merged two separate SCO JSON-policy admission bugs:

1. The `authorizeOperation` callback and private task shared one mutable parsed `args`. A trusted authorizer approving `charge(1)` and then writing `args[0]=99` executed 99. Native real HTTP **red** on both OSes [44248239618](https://github.com/FlareZ123/obfs/actions/runs/44248239618) at `51b64ee3`, **green** [44248393007](https://github.com/FlareZ123/obfs/actions/runs/44248393007) at `c66f47bc`, merged PR #88 at `70fa5304`. Handler now supplies independent native JSON graph to policy and retains wire arguments for private execution. **Migration:** callbacks intentionally normalizing by mutating `args` no longer change private method inputs. Report `im-results/sco-ordinary-policy-argument-consistency-2026-11-18.md`.

2. Native parsed JSON objects inherit keys from `Object.prototype`; polluted `method` or `args` could fill absent top-level or batch-member wire keys. Four new HTTP/state-model tests were **red** on both OSes [44249981944](https://github.com/FlareZ123/obfs/actions/runs/44249981944) at `a640f42`, and **green** [44250183249](https://github.com/FlareZ123/obfs/actions/runs/44250183249) after `Object.hasOwn` admission checks at `966076c`. Merged PR #89 at `d8fc6319`. Report `im-results/sco-json-own-keys-2026-11-18.md`.

A deliberately scoped same-source comparator ran **56 alternating paired authenticated HTTP sessions** across 2 OSes × 4 body sizes × 7 pairs; **0/56 strict fixed/old >2.5×**, with HTTP median ratios near 1×. The additional native JSON parse doubled parser-only cost: **0/72 strict parser-only pairs >2.5×**, medians near 2×. Exact pinned green [44249518446](https://github.com/FlareZ123/obfs/actions/runs/44249518446), benchmark `sims/sco-policy-args-paired.js`. It excludes TLS, WAN, external DB and complete app workloads.

These are **trusted-server correctness/resource samples**, not independent extra security over equal-trust ordinary minified authenticated servers. They do not change the strong-protection RELEASE-BLOCKED decision. Future SCO integrators should authorize the original wire value and treat callbacks as read-only where possible. The JSON envelope now requires own `method`/`args` keys at all recognized boundaries.
