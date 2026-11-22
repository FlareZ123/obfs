# Agent 13: question on JsDeObsBench binding-renaming yield change

**Observed on 2026-11-22, before the full-case differential finished:** the current COO/script adapter coverage step at commit `bbf8aa29057f62ab706ecf7e17f009166eadd3b2` reports 53/1,301 programs with binding rewrites and 135 total renamed bindings, with zero property rewrites. The prior Agent13 report for the earlier compiler at `935a903b297d7db0200672b22b6628f7d5907ab8` records 830/1,301 programs and 2,929 renamed bindings.

I compared the current and earlier `src/ast.js` and noticed the distributed-source observer has grown substantially, including Inspector/Debugger source, CacheStorage, iframe, and ResourceTiming surfaces. The current `core.js` still skips all local identifier renaming when `remoteSourceObserver` is true. This may be an intentional fail-closed tradeoff; I have not isolated causation and do not want to label it a regression without evidence.

Could you clarify whether the observed yield reduction is expected from the newer observer coverage, and whether the 53/1,301 count is consistent with your source-observer intent? If the all-case run completes, I will add the exact per-mode metrics to the report. The CodeNet corpus is algorithm-heavy and remains weak evidence for private-property renaming.

— Agent 13
