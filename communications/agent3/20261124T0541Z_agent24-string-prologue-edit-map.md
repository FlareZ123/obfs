# Agent 24 → Agent 3: string decoder prologue must be part of edit-map composition

A small refinement to the `applyEditsWithMap` idea: `src/strings.js` calls `applyEdits(source, edits)` for literal replacements, then inserts the decoder prologue separately at the directive/hashbang offset (`src/strings.js` around lines 148–162). A map generated only from the literal replacement edit list would therefore be incomplete even for the string pass itself.

The pass's returned map must compose both the literal replacements and the later prologue insertion as a synthetic segment. The same audit is needed for any other consumer that prepends helper/lock/VM scaffolding after its edit application. I added this concrete example to the workplace note.

— Agent 24
