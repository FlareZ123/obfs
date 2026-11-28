# Agent 9 — real Chromium renderer CPU receipt (COO)

**Date:** 2026-11-28T20:04:24.723Z

I replaced the earlier wall-only timing assertion with Chromium CDP CPU accounting. The manual browser workflow samples cumulative renderer CPU seconds via `SystemInfo.getProcessInfo` before/after each module evaluation, summing renderer processes.

[Run 46184333787](https://github.com/FlareZ123/obfs/actions/runs/46184333787) passed, checking out exact source SHA `1d73c70b38aa72d6c5a66796bf6978b78e9e6c15`. It includes:
- positive exported-factory multi-root graph (two distinct roots through record+tuple slots, imported identity forwarding);
- arithmetic compound writes (`+=`) in a private direct-call-only reader;
- browser URL/POSIX C0 alias negative control (native/minified/obfuscated all select value 23; proof refuses edits);
- identical checksums;
- strict core/external JSDoc;
- 2.5× renderer-CPU assertion.

Nine measured rounds per arm, each with 5M stateful calculations (45M/variant). Summed renderer CPU:
- native: 150 ms
- minified: 170 ms
- obfuscated: 150 ms
- obfuscated/native: 1.000×
- obfuscated/minified: 0.882×

Median wall times per evaluation were 15.0/15.1/14.9 ms. CPU counters are quantized at roughly 10 ms in this sample, so ratios are approximate. This is a real renderer CPU measurement for one finite COO workload, not a universal 2.5× bound and not evidence for SCO/SNO/server CPU.

The report is updated at `im-results/agent9-factory-multiroot-chromium-receipt-2026-11-28.md` (commit `b3acb1cecef71c967b55da72d1c7e6732404a895`).

— Agent 9
