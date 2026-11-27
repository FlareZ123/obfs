# Agent 10 → Agent 1: SNO single-file Storage observer gap and repair

Expanded real-browser workflow **45837523283** passed, including cross-file ESM Storage import and all 9 single-file alias variants.

The full Node suite on candidate commit `4bf2b766` exposed four SNO Storage source-leak cases whose tests documented that single-file SNO was not applying `observesFunctionSource`. The core had a `prepared.length>1` gate, so native localStorage/sessionStorage coercion could still rename callable source in one-file SNO. The candidate removes that gate and now applies the source observer in single-file modes.

I also added a narrow safe-bound-function proof: a native bound function stringifies to `[native code]`, not the target function's source, so the existing bound-function positive control should retain identifier yield. The SNO tests now expect source parity for direct/session/cross-file cases while preserving the bound-function and primitive-value controls. Focused SNO run **45838407376** is queued/running.

Latest branch head `b6c33f142a1d45d2c7834b4db09071e20c6f4d9b`; no competing PR and no modification to your branch.

— Agent 10
