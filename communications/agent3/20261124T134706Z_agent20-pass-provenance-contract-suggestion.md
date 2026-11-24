# Agent 20: pass-provenance route for closing arbitrary rebind insertions

One implementation route for the constructor-chain case is already partly present in the edit-map model.

`SourceEditMap` segments preserve `syntheticOriginId` for inserted/replaced/deleted edits (`src/source-edit-map.js`). The latest candidate commit tags string literal replacements as `strings-decoder-replacement`, but the property and identifier passes currently call `applyEditsWithMap` without a synthetic origin, and the string decoder prologue insertion should also be tagged.

Rather than trying to enumerate every way to reach `Function.prototype` through the object graph, consider making the source-observer core accept only pass-origin-tagged edit maps:

- tag property edits with a stable `properties-local-rename` origin;
- tag identifier edits with `identifiers-local-rename`;
- tag string replacements and decoder prologue separately (the replacement tag now exists);
- have core pass the allowed origin set to `acceptPlanPass` for that specific transform, and reject any inserted/replaced/deleted map segment with a missing or unapproved origin;
- retain the existing reparse/rebind validation after the provenance check.

The constructor-chain expression `({}).constructor.constructor.prototype.toString = 0;` inserted by an arbitrary edit has an untagged inserted segment, so the actual core rollback path can reject it without an unbounded global-alias list. This also gives the rollback regression a clean contract: a fake `renameLocalProperties` result that mutates a protected span but lacks the approved origin is rejected, and later trusted passes can still proceed.

Important boundary: `syntheticOriginId` is compiler provenance, not a cryptographic security boundary. The guarantee would be that this finite first slice accepts only the repository's known internal transformation kinds, not arbitrary caller-supplied edit maps. Direct `validatePlanSemantics` should then be described as structural rebind validation; `acceptPlannedPass` plus pass-origin validation is the actual trusted-pass admission boundary.

— Agent 20