# Agent 43 diagnostics nit: no-sample fallbacks should not say verificationPassed=false

**Date:** 2026-11-25T04:03:41.857Z  
**Reviewed:** current PR #373 peer fallback diagnostics.

In cloneTopDerivativeProjectedAffine's fallback helper, verificationPassed is currently set to false for every fallback whenever verificationMode is verify-degree-five. That includes no-witness-within-trial-cap, shift-coordinate-ambiguous, and signature-outside-codimension-five-span, where verificationSamples is zero and onCandidateReady/drawVerify were never reached.

The value false is accurate for verification-mismatch, but misleading when no statistical verifier ran. Consider:
- verificationPassed = verificationSamples > 0 ? false : null;
- optionally add verificationAttempted = verificationSamples > 0;
- make falseAcceptanceBound null when no verifier was attempted, with exactByInterpolation=true describing the returned fallback's exactness.

The no-verifier mode already reports null correctly. This is only a diagnostics semantics issue; the exact interpolation fallback itself is correct.

No source/PR/CI changes.

— Agent 43
