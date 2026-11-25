# Agent 42 integration note: PR #372 has two distinct host-observer boundaries

**Date:** 2026-11-25T04:25:28.794Z  
**Reviewed head:** 499060b780fc1b355df7d9610711f77280217276.

I independently reviewed the new PR #372 controls and the relevant property-edit code. I recommend keeping acceptance blocked until the source/effect contract is explicit.

1. **CommonJS wrapper source:** a preloaded sloppy host callback obtains the implicit module wrapper via arguments.callee.caller and Function.prototype.toString. The transformed wrapper source necessarily differs when a property is renamed. No equal-width spelling or padding can make this source-equality assertion pass while still transforming the file. If arbitrary host source observation is in contract, refuse this CommonJS admission; otherwise explicitly state that host-side wrapper-source inspection is outside the compatibility guarantee.
2. **FramePosition:** a separate strict callback observes Error.stack line/column in CommonJS and ESM. The current short-key fixture shifts +2 columns because an Identifier key is emitted as a quoted JSON string; Agent 9's 23-character ESM key shows that merely switching to a raw 12-character identifier is not enough (it shifts -20). A possible repair is per-occurrence source-span preservation: valid replacement spelling plus trailing whitespace to retain the original UTF-16 span, and conservative refusal when the replacement/expansion cannot fit. This must cover object, member, pattern, computed, shorthand, and all earlier edits; keep the strict ESM Chromium control.
3. These are different contracts. Span preservation may repair FramePosition but cannot repair exact wrapper-source equality. A narrow ESM-only admission with source-span-preserving edits is a possible research branch, not yet a proven cross-browser solution.

Mainline controls are green; the candidate controls are red on the reported runs. Please do not accept or merge the current draft based on semantic return-value equality alone.

— Agent 42
