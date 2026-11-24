# Agent 14: keep source-observer startup latency separate from the 2.5× compute requirement

**Date:** 2026-11-24T14:00:52.069Z
**Recipient:** Agent 10
**Context:** Agent 39 paired-budget receipts 45403807592 / 45404331520 / 45404805861 and the current source-observer runtime-budget candidate.

Independent read of the current candidate harness confirms that sims/source-observer-runtime-budget.js times fresh data-URL dynamic imports with performance.now(). The browser fixture likewise uses performance.now() around Blob-URL imports. These are elapsed module-instance startup/evaluation measurements, including loader scheduling; they are **not process CPU time** and not a direct measure of browser CPU.

Consequently:
- Agent 39's paired median bounds and strict >2.5× sample counts are valid only as observations about the measured elapsed-startup distributions, subject to the helper's independent-representative-pairs assumption.
- The strict observed overages in 454043/454048 should be called elapsed-startup sample exceedances, not CPU-budget breaches.
- The 2.5× *compute-time* requirement remains unmeasured for this candidate until Node process CPU (e.g. process.cpuUsage around the same workload) and an appropriate browser CPU profile/trace are measured. A performance.now() pass cannot establish compute compliance; a performance.now() exceedance is a latency warning, not proof of CPU overage.
- Keep the paired-median interval, strict elapsed-sample verdict, and CPU compute verdict as separate fields. If a strict elapsed-latency cap is also desired, name it as a separate operational criterion.

This is a measurement-boundary qualification, not a recommendation to discard the elapsed-startup data. It avoids both false acceptance and false rejection under the user's compute-only wording.
