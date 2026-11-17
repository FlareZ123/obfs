# Four-way native/minified/COO/public-reconstructed Chromium, measured with a live CPU clock

**Date:** 2026-11-17 UTC. **Status:** independent intermediate experiment with an empirically observed strict runtime-budget breach. **Ownership:** Agent 8. Based on Agent 4's frozen three-module ESM four-way comparator at `2b372bf3b06d9f196ce87b1b130632af749a7b48`. This document is deliberately in `im-results/`, not the established `results/` index.

## What this controls

Agent 4's prior four-way comparison used Chromium `--virtual-time-budget=30000`, `--dump-dom` and page `performance.now()` for CPU timing. Agent 8 previously demonstrated an independently reproducible all-zero CPU clock in a distinct three-way Chromium harness under virtual time; see [the earlier clock falsification](polyvariant-app-cold-browser-clock-2026-11-17.md). That evidence does not automatically invalidate Agent 4's separate past measurements. It demands an independent clock control and explicit page completion before deriving performance claims.

On the companion branch `agent8/four-way-real-clock-20261117`, `test/polyvariant-app-four-way-browser.js` now uses `puppeteer-core@25.16.0`, absolute Linux Chrome executable, normal real-time `page.goto()` plus `waitForFunction()` for an explicit pass/fail DOM marker, and a five-million-iteration synchronous `performance.now()` positive control. The warm comparison still invokes identical 10,000-event application work. The cold comparison uses unique three-file URL graphs per variant/trial, with exact full-output and host-callback equivalence, and splits `importMs` from the subsequent **synchronous `computeMs`**, retaining independent `totalMs`. This matters because HTTP/module import delays can mask a >2.5× compute overhead.

Exact sources and CI:
- [Run 44130882371](https://github.com/FlareZ123/obfs/actions/runs/44130882371) at `7567c3798a61fa6b9ebcdd1b39655782cf01f433`: first real-clock browser and Node verification green, browser clock 28.9 ms, 288 unique cold ESM requests, full native/minified/COO/reconstructed semantics and callback equality. Warm 10,000-event native/COO ratio-of-medians 3.2/6.7 = **2.09375×**. This run preceded import-versus-compute decomposition.
- [Run 44131139982](https://github.com/FlareZ123/obfs/actions/runs/44131139982) at `242b9d582cb3ac084e0b8d60f42408f698b20c79`: Ubuntu Chrome/157.0.8103.50 and both Ubuntu/Windows Node22 function extraction, public-only reconstruction, equal-query attacker, and exact full graph outputs succeeded. Chrome probe advanced **237.9 ms**, 288 unique module GETs verified, external callbacks matched. Every individual import+compute component sum matched its total to floating-point tolerance.
- **Overall workflow status for both runs: failure**, solely because `npm run typecheck:external` on the pre-existing older PR49 baseline retains TS errors in `sims/sco-private-windows-alias-probe.js`, `src/ast.js`, and `test/sco-selected-handler.test.js`. The strict checker was moved to a final `if:always()` step to preserve substantive experimental evidence without misreporting a green workflow. These source errors predate the companion branch and must be separately reconciled with moving main. Latest source commit after this run adds an explicit breach summary, so it requires its own validation.

## Measured paired Chromium application cost (second run)

All durations are milliseconds. *Ratio* is the ratio of two sample medians, so it need not equal the median of within-trial paired ratios. There are twelve matched trials per variant. Browser launch and graph construction time are excluded, except each cold graph trial's measured HTTP/import/parse/link/eval cost.

| Chrome 157 experiment | Native median | esbuild-minified median | COO median | Seedless attacker median | COO/native ratio | COO paired >2.5× |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Warm synchronous 10,000-event compute | 4.75 | 4.90 | 10.60 | 4.90 | **2.23158×** | **2 of 12** |
| Fresh ESM graph, 10,000-event *synchronous compute only* | 7.65 | 8.05 | 15.45 | see full raw marker | **2.01961×** | 0 of 12 |
| Fresh ESM graph, 10,000-event *import+compute total* | 12.95 | see full marker | 22.40 | see full marker | **1.72973×** | 1 of 12 |
| Fresh ESM graph, 1-event *import+compute total* | 5.15 | see full marker | 5.60 | see full marker | **1.08738×** | 0 of 12 |

At the same exact source and clock, the warm 10,000-event sample's paired ratios crossed 2.5× twice:
- Trial 3 (zero-based index 2): native **4.7 ms**, COO **12.3 ms**, ratio **2.61702×**.
- Trial 5 (zero-based index 4): native **4.5 ms**, COO **12.4 ms**, ratio **2.75556×**.

The one-sided distribution-free median bound helper reports upper median paired ratio **2.30435×** at actual nominal order-statistic coverage 98.0712890625% for the warmed 12 pairs. That *population-median* estimate does **not** certify the strict maximum overhead. Its own count `observedPairsWithinBudget=10` establishes an observed strict-budget violation. The 10,000-event cold synchronous CPU ratio had twelve of twelve within budget and upper paired median **2.11111×**; its first-event compute measurements are only ~0.1–0.7 ms, with a 3.5× single paired ratio that is sensitive to timer resolution. A fresh 10k total had one **206.4 ms** COO outlier versus **12.7 ms** native, a **16.25197×** paired wall-time ratio; the separate synchronous compute component did not breach in that case. Do not attribute the outlier to CPU obfuscation without trace attribution.

The warm sample confirms a strict measured breach **for this workload**, while the trial distribution and another independent runner produced different medians. Never generalize this comparison to all hardware, dynamic browser versions, short runtimes, WAN latency, or arbitrary JavaScript.

## Attack result and security interpretation

The four-way Node runner `sims/polyvariant-app-four-way-control.js` on both operating systems recovered all three selected COO arithmetic leaves from **public output** with no seed/original source. Its esbuild-minified extraction also recovered all three leaves. An independent three-query Int32-translation oracle, identically budgeted against native, esbuild, COO and reconstructed exports, predicted `round1=324`, `round2=292`, `round3=324`, then matched each distribution on **12,288 additional verification-only test inputs**. These holdouts are *not* counted as attacker queries. This is a bounded and concrete program/function reconstruction witness; it disproves strong selected-function secrecy in the frozen application, without making claims about unrelated programs or unknown algorithms.

The four-way experiment does not directly evaluate SCO account authorization, hostile runtime integrity bypasses, or SNO filesystem compromise. Independent threat-model evidence elsewhere in this repository remains applicable.

## Reproduction and limits

Run the **manual-dispatch-only** `.github/workflows/manual-minified-control.yml` on `agent8/four-way-real-clock-20261117`. The test requires Node 22, declared npm dependencies, Ubuntu Chrome at `/usr/bin/google-chrome` and local loopback HTTP. The workflow records JSON under `four-way-node-Linux.json`, `four-way-node-Windows.json`, and `four-way-browser-Linux.json`; logs contain `MINIFIED_FOUR_WAY_CONTROL` and `MINIFIED_FOUR_WAY_CHROMIUM`. No external remote server, browser simulation or source-only reconstructed input is silently substituted.

The compact strict-sample field is validated by the third exact-head run [44131857565](https://github.com/FlareZ123/obfs/actions/runs/44131857565) at `3b768e34fd59010331b3d893f8044fec4c7f97b7`. Every Node and browser experiment step passed on its assigned runner; **both jobs remain overall red only due to the inherited JSDoc errors**. Ubuntu Chrome 157 returned a live 92.1ms CPU probe and all 288 cold module requests. On this repeat, warm 10k medians shifted to native 4.2ms / COO 8.55ms (**2.03571×**) and **0/12** warm compute pairs exceeded 2.5×. Cold 10k synchronous CPU medians were native 6.45ms / COO 12.25ms (**1.89922×**), also 0/12 overbudget. The cold 10k **combined total** still had one overbudget pair (11/12 within), illustrating the importance of reporting import and compute separately. This repeat establishes observed **run-to-run variability**: previous 44131139982 has 2/12 actual warm CPU breaches, third run has 0/12. Neither permits a universal strict maximum guarantee. The 98.0712890625%-coverage one-sided order-statistic conclusions apply to a *median of paired ratios* under independence; individual maxima are explicitly separately reported.

Until inherited JSDoc errors are fixed and this branch is reconciled with moving main, keep the companion PR draft and distinguish experimental-step pass from overall CI failure.
