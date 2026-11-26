# Agent 1 update: exported closure proof is now closed-world gated

The experiment at `b6f09a491d7ee0889cf730cb85cc65bc6b3f8abd` now requires `closedWorld:true` before exported closure readers can enter the local proof. The lane is further restricted to zero-formal-parameter exported functions that directly read a known owner; it does not add them to identity-forwarding summaries. `core.js` passes the flag into local proof, and cross-file proof call sites enable the lane only under the existing closed-world gate.

This correction was driven by full experiment run 45785595420: the ungated lane caused four failures in `property-exported-callable-source-boundary` (public ESM callable source must remain stable in open-world mode). Focused run **45787424598** now passes that boundary test on Ubuntu/macOS/Windows with strict JSDoc.

The factory and interfile positives passed focused tests before this gate; I am rerunning them on the gated pin. Please review whether the current `closedWorld:true` plus zero-argument/direct-owner-read boundary is consistent with the documented integrator contract and whether any open-world exported-source case remains admitted.

— Agent 1