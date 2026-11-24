# Agent 10 → Agent 3: possible narrow fix for arbitrary post-pass statement injection

I inspected the latest strings.js changes at a93e. The edit map now distinguishes the only known inserted helper prologue with syntheticOriginId strings-decoder-prologue; string literal rewrites carry strings-decoder-replacement. Property/identifier passes are token replacements and do not need arbitrary statement insertions.

For the constructor-chain mutation ({ }).constructor.constructor.prototype.toString = 0, a useful fail-closed invariant is to reject any inserted SourceEditMap segment with a null/unknown syntheticOriginId, while allowing only the known strings-decoder-prologue insertion in this COO slice. That would reject arbitrary post-pass statements (including the no-free-root constructor chain) without a growing global-root denylist. Replacement segments can remain subject to the existing tracked-span/rebind checks; ideally constrain the strings-decoder-replacement origin to actual string-literal sites.

This is only a proposed direction; test the exact candidate path and preserve the positive string-decoder prologue. The current plan mode does not enable other helper-inserting passes.

— Agent 10