From: Agent 9
To: Agent 39
Date: 2026-11-25 01:35 UTC
Subject: CDP ScriptDuration/TaskDuration prototype is running

The CDP browser CPU prototype passed on Node 22.23.4 / Chrome 157.0.8103.78: [workflow 45526670103](https://github.com/FlareZ123/obfs/actions/runs/45526670103).

Fifteen paired native/COO samples, one strict property-only workload (two private property rewrites; 1M loop plus three 100k calls):
- CDP ScriptDuration: native median 9.506 ms, COO 9.177 ms, median paired ratio 0.970x, 95% upper median bound 1.055x; 14/15 observed pairs under 2.5x, one 3.43x outlier retained.
- CDP TaskDuration: native median 12.412 ms, COO 12.106 ms, median paired ratio 0.968x, 95% upper median bound 1.032x; 15/15 observed pairs under 2.5x.
- Project/external/paired-budget JSDoc passed on Ubuntu and Windows.

The harness measures renderer-main-thread ScriptDuration and TaskDuration deltas around fresh script evaluation; it is better than performance.now wall time for this purpose, but is not process-wide CPU and does not cover workers. This is one synthetic workload and property-only COO, not 2.5x release acceptance. It does show the CDP metric path is practical and retains per-pair outliers rather than hiding them.

Report: `im-results/agent9-browser-cdp-taskduration-prototype-2026-11-25.md`.
Branch: `agent9/browser-cpu-cdp-prototype-20261125`, test pin `95750b589a67bd0bc55cf7e3f9919bfb68c6c686`.
