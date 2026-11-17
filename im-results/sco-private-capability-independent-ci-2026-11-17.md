# Independent PR #65 SCO private-capability full-branch run, 17 November 2026

**Status:** provisional branch-only integration evidence; candidate remains **RELEASE-BLOCKED**. Reviewed by Agent 37 without changing the branch or draft PR.

## Pinned source and workflow

Source: [draft PR #65](https://github.com/FlareZ123/obfs/pull/65), exact head `b4deea5b0ff606109e751e954686d376186f779a`. Independently dispatched [manual Linux/Windows/Ubuntu-Chromium workflow 44200187195](https://github.com/FlareZ123/obfs/actions/runs/44200187195), Node.js 22.23.4, jobs `134451968272` (Ubuntu) and `134451968817` (Windows). No changes to the private-capability implementation were made.

## Observed integration outcomes

**Both full jobs failed.** Ubuntu: **2,600 total / 2,595 passed / 4 failed / 1 skipped**. Windows: **2,600 total / 2,593 passed / 4 failed / 3 skipped**. Both strict JSDoc configurations and sampled baseline benchmarks passed.

The *new* candidate's actual two-account SCO HTTP test passed on both operating systems; it verified a 43-character random handle, public projection without server-private secret text, unauthorized account denial, cross-account handle refusal, same-account authorized relay, revocation and post-revocation refusal. Its actual compiled-and-served ESM facade test also passed on both OSes, verifying private state retention across three successive authorized operations and native/generated output agreement. All six new unit cases covering async scope, quotas, principal separation and FIFO scheduling also passed.

Four **other positive property-yield tests** failed on each platform: `test/application-challenge-null-prototype-yield.test.js`, `test/application-challenge-token-neutralize.test.js`, `test/cross-file-reader-flow.test.js`, and `test/ownkey-comment-static-recovery.test.js`; the expected one/two genuinely renamed private keys were zero. The real Chromium `verified-record-browser.js` separate positive also failed its expected private-field yield. The older source branch predates the later 17 November integrated proof/yield reconciliation. Independent [historical git bisects](property-yield-first-bad-2026-11-17.md) had already established these yield regressions before this branch's capability feature, so this run does **not** demonstrate that the new capability code caused them. Full branch validation nevertheless remains red. The newer unrelated [mainline green gate 44197962949](https://github.com/FlareZ123/obfs/actions/runs/44197962949) tests a different source revision and cannot be used to certify the draft PR.

## Decision

This source-pinned run closes the precise evidence gap that new HTTP and generated facade tests had never been exercised against the **actual repository** on both OSes. They passed under the branch revision. A rebase onto current green main plus targeted tests is necessary to remove inherited yield failures and verify merge compatibility. The original independent static/dynamic extraction hypothesis still requires actual-public-bytes attacks, cross-session browser work and balanced complete-workload timing. A local short pair previously reached **3.04140×** overhead in the author's [CPU probe](sco-private-capability-cost-2026-11-17.md), violating strict 2.5× under its measured boundary. Same-account authorized relay is an explicitly expected attacker success, so no client anti-cloning claim follows from this run.
