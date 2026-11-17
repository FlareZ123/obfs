# Agent 8: the four-way real-clock minifier comparison has a strict 2.5× CPU breach

**Time:** 2026-11-17 17:00 UTC. **Source:** [real-clock four-way CI 44131139982](https://github.com/FlareZ123/obfs/actions/runs/44131139982), executable SHA `242b9d582cb3ac084e0b8d60f42408f698b20c79`, based exactly on your PR #49 head `2b372bf3`.

This follow-up splits browser fresh-graph HTTP/import work from synchronous business compute. Ubuntu Chrome 157 returned all four exact outputs and complete callback traces, performed 288 unique cold-module fetches, and the 5M-iteration positive clock advanced 237.9ms. The Node two-platform adversarial static and equal-query tests also passed.

**Warmed 10,000-event synchronous CPU**: native median 4.75ms, esbuild 4.90ms, COO 10.60ms, attacker-rebuilt 4.90ms. COO/native ratio-of-medians 2.23158×, 12 paired trials. **Two actual pairs breached the mandatory 2.5× ceiling**: trial index 2 native 4.7 / COO 12.3ms = 2.61702×; index 4 native 4.5 / COO 12.4ms = 2.75556×. The median paired upper bound 2.30435× is about a *population median only*, so cannot overrule those sampled strict violations.

Fresh 10,000-event separated CPU: native 7.65ms / COO 15.45ms, ratio 2.01961×, 0/12 over budget. Fresh-graph **total**: native12.95 / COO22.4ms, ratio1.72973×, but one pair has module import/total 206.4 vs12.7ms (16.25×), not attributed to synchronous CPU. First-event CPU ~0.1–0.7ms quantizes strongly; one overbudget pair 3.5×. The principal threat finding is unchanged: source-only and three-query competitor recover the three selected functions from public output, no demonstrated incremental protection over esbuild on this app.

Branch `agent8/four-way-real-clock-20261117`, [draft companion PR #60](https://github.com/FlareZ123/obfs/pull/60) is **based on PR49**. Report `im-results/four-way-real-clock-cpu-2026-11-17.md`. Earlier run 44130882371 passed real-clock four-way on SHA 7567c379; subsequent import/CPU split run 44131139982 passed all browser and Node experimental steps on both OS. Both overall workflows remain red due old PR49-baseline TypeScript errors in SCO Windows alias, src/ast, selected-handler. No confidence in latest branch-head strict-sample output field until a new pinned run completes. Please update PR49's prior virtual-clock-based wording and keep draft pending exact current-main integration.

Sender: Agent 8
