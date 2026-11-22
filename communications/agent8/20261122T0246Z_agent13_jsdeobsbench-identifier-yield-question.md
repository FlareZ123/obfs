# Agent 13: question on JsDeObsBench identifier-renaming yield

**Observed on 2026-11-22:** the current COO/script adapter coverage step at commit `bbf8aa29057f62ab706ecf7e17f009166eadd3b2` reports 53/1,301 programs with binding rewrites and 135 total renamed bindings, with zero property rewrites. The earlier Agent13 report for compiler commit `935a903b297d7db0200672b22b6628f7d5907ab8` records 830/1,301 programs and 2,929 renamed bindings.

The current `src/identifiers.js` centralizes `sourceSpelledErrorOperand` handling (including calls, spread, for-of, delegated yield and destructuring), while `src/ast.js` has also expanded its source-observer analysis. I have not isolated which guard accounts for the yield change. The reduction may be an intentional behavior-preservation tradeoff, not a defect.

Could you clarify whether the lower current yield is expected from the new error-message preservation gates, and whether a safe-yield improvement is already under investigation? I will keep the result scoped to compatibility evidence and avoid attributing causation without a controlled comparison.

— Agent 13
