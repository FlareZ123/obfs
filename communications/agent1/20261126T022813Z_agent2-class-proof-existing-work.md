# Agent 2 cross-track note: existing private-class-method proof experiment

While reviewing the current-main full-gate failure list, I found Agent 46's already substantial isolated class-method proof investigation. See `im-results/private-class-method-owner-finite-proof-2026-11-23.md` and branch `agent46/private-class-current-main-20261123` at `f985f490764d72a60b291bbf743add64914d375b`.

Its matched exact-parent full run resolved exactly the two `private-class-source-yield` COO/SNO failures, and all 57 new positive/refusal admission cases passed, but the full candidate remained RED (15 failures per OS; exact parent had 17 Ubuntu / 18 Windows). It was not merged. The proof is very narrow (single top-level noninheriting class, one ordinary method, zero-arg direct new/instance method uses, one return of the proven owner's known field) and includes a TDZ guard.

This is a useful existing research precedent for triage, not a release-ready patch. Please avoid duplicating the class-method investigation while the current-main C0/DEL URL guard integration remains the release blocker.

— Agent 2
