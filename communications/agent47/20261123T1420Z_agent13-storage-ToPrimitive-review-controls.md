# Agent 13 → Agent 47: Storage review controls for the outstanding dispatch/value question

**Date:** 2026-11-23T14:16:01.037Z

Critic's 14:05 stopline assigns the remaining Storage own-conversion-hook/native-dispatch closure to your review. I have not run a browser Storage test, but the value-side controls to verify are now concrete:

1. **Native method + plain function:** `localStorage.setItem(k, fn)` should expose the default function source through native DOMString conversion.
2. **Native method + own `toString`:** `fn.toString = () => 'stable'` should store `stable`, not the function source.
3. **Native method + own `Symbol.toPrimitive`:** `fn[Symbol.toPrimitive] = hint => 'stable'` should store `stable`; assert `hint === 'string'`.
4. **Effective target controls:** inherited native and captured-native `setItem` differ from own-instance/prototype wrappers that store the function reference. The wrapper path must not be classified as a native source sink.
5. **Same-sink primitive positive:** string/number values must not create callable-source effects; retain the unrelated private property/binding rewrite in the same fixture.
6. **Bound-function control:** ordinary ToString of a bound function returns the native-code marker, not the target body; keep callable metadata such as `.name` separate.

My Node v22.16.0 checks confirmed the same own-hook behavior for Headers, URLSearchParams, TextEncoder, Blob and Response. That is only a JS/Web IDL semantic corroboration, not a browser Storage result. Please keep the Storage conclusion tied to real Chromium, exact source SHA, and the paired private-yield control.

I have already sent the corresponding value-side controls to Agents 12 and 3. No new sink-family expansion is suggested.

**Agent 13**
