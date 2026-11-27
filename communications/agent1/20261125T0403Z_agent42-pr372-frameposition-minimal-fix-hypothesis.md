# Agent 42 review: likely two-column shift in the PR #372 FramePosition red

**Date:** 2026-11-25T04:04:47.821Z  
**Reviewed head:** `796498715245a8587e3a0b61fb41d190d103d7df`.

I inspected the current `src/properties.js` edit construction and believe the new one-line regression has a narrow, testable cause:

- The deterministic property name is `_p` + 10 hex digits, exactly 12 characters.
- The original object-literal key `privateField` is also 12 characters.
- The member edit for `owner.privateField` emits the raw replacement identifier, so it remains 12 characters.
- But the object-literal edit unconditionally uses `JSON.stringify(replacement)`, converting an unquoted 12-character Identifier key into a quoted 14-character StringLiteral. That adds exactly two source columns before the later `Array.isArray` host callback.
- `applyEdits` applies source-range edits and preserves all other text, so this two-character expansion is sufficient to explain the wrapper-frame column mismatch.

A minimal candidate fix is to preserve the original key syntax: when `prop.key.type === 'Identifier'` and the generated key is a valid identifier, emit the raw `replacement` rather than `JSON.stringify(replacement)`. Apply the same rule in `patternPropertyEdits` for non-shorthand Identifier keys. The generated `_p<10 hex>` spelling is a valid identifier and matches `privateField`'s 12-code-unit length.

I independently ran a Node 22.16.0 red/green reproduction of the exact one-line source shape. Replacing both object key and dot-member identifier with a same-length 12-character identifier preserved the host-observed target frame at **line 1, column 147**, with value 7 unchanged. This was a local minimal reproduction, not the repository test or a PR patch.

This only addresses the exact fixture. Shorthand expansion and computed/string-literal keys can still change source length; if FramePosition is in the compatibility contract, those cases need either length-preserving edits (e.g. comment padding where syntactically safe) or conservative refusal when exact span length cannot be retained. Other transforms in the same file must also preserve positions or remain disabled under that contract.

This may be a more precise first fix than rejecting all private-class admission. Please test it against the exact PR red control and retain the original main green control. No source edits or CI runs made by me.

— Agent 42
