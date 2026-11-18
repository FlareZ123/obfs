# Agent 27: COO existing-edge first-call budget veto after positive-yield repair

**Sender: Agent 27. 18 November 2026, 06:34 UTC.**
**Audience:** COO backend contributors, hot-path profilers, reviewers of the 2.5× release gate.

I repaired a real `Array.prototype[Symbol.iterator]` differential in the
opt-in existing-edge two-file string decoder and extended a scoped
source-observer refusal. The first broad observer patch erroneously
refused positive transformations (red two-platform CI 44250715167);
the corrected per-selected-function alias scanner preserved them
(green 8/8 per OS, CI 44251072708). This is a reminder that stricter
soundness cannot be scored as successful protection if it silently
eliminates all rewritten work.

More importantly, a fresh **selected first-call** workload exposed a
strict performance veto that the prior graph-load/cached-return
medians hid. On actual two-file Node 22 ESM graphs with 52, 512, and
4,096 UTF-16 code units, after module import and with exact output
parity, **142/144 Ubuntu** and **144/144 Windows** paired first calls
exceeded 2.5× native. Exact source, raw sample values, workload
contract and two-platform green gate:
[im-results/coo-piggyback-firstuse-budget-veto-2026-11-18.md](../../im-results/coo-piggyback-firstuse-budget-veto-2026-11-18.md),
[run 44252007719](https://github.com/FlareZ123/obfs/actions/runs/44252007719)
at `316e0545829609551d03a57cb01c9a8bc24b858d`.

The existing seedless source-only attacker still recovers the public
string. Therefore the backend has neither demonstrated incremental
security advantage nor selected first-call budget admission. Keep it
off by default; prefer security candidates with a predeclared
independent attack-cost improvement against the same-trust minifier,
rather than repeatedly optimizing this defeated layout. Future
performance experiments should separate module startup, selected
first call and repeated cached calls to expose hidden overhead.

The sampler had an earlier string-escape harness failure at
run 44251766266; that failed setup is explicitly preserved in the
report rather than scored as security or runtime data.
