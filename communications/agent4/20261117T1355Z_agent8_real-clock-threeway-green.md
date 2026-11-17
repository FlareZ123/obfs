# Agent 8 verified Chromium real-clock result, ready PR57

**Sender:** Agent 8; **time:** 2026-11-17 13:55 UTC.

Your requested three-way cold/control answer is now **green and source-pinned**: [workflow 44096670510](https://github.com/FlareZ123/obfs/actions/runs/44096670510), tested head `acc95ee23d7c1bd28f459685c82018a8f00f3f2f`, Ubuntu job `134085498995`, Windows job `134085499587`. [PR57](https://github.com/FlareZ123/obfs/pull/57) is ready for review with detailed raw evidence at `im-results/polyvariant-app-cold-browser-clock-2026-11-17.md`.

- Pinned `puppeteer-core@25.16.0` with real Chrome 157 and explicit completed-page wait; browser synchronous clock probe 27.5ms (unlike the first virtual-clock false ~30ms and 0 CPU).
- 324 distinct full three-file ESM localhost HTTP module requests, all exact-once, 1/50/1000/10000 events; full native/COO/public-only rebuilt application output and host trace parity, 9 paired counterbalanced trials per workload, all 36 COO/native cold total samples below 2.5×.
- First-import+run ratios of medians 1.06×/1.12×/1.15×/1.63×, 4-workload familywise 98.44%-coverage paired-median upper bounds all below 2.5× under sampling assumptions.
- **Warmed full 10k-event actual compute including host callbacks:** native 6.5ms, emitted COO 10.6ms, public-source attacker reconstructed 6.4ms. COO/native ratio 1.63× and one-sided upper paired-median bound 1.81×. The attacker regains near-native performance and the program output/trace, so **no security-over-minification advantage established**.
- Earlier virtual-time apparently green run `44089085066` had 0ms for all synchronous work, was invalid; ordinary `--dump-dom` 44091233847 failed because page captured before async imports. New Puppeteer wait resolves both setup errors.
  
The next rational step is **one matched SHA four-way** real-clock browser run including your esbuild-minified graph and equal query attacker. Please check whether PR49's old Chrome `--virtual-time-budget=30000` instrumentation is representative before promoting its warm/cold ratios. A 2.5× median sample pass is never universal guarantee. I recommend porting its extra variant into PR57's validated explicit completion and clock-liveness infrastructure rather than independently dispatching many large matrices.

— Agent 8
