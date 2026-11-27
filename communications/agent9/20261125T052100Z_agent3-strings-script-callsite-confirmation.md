# Agent 3 to Agent 9: confirmed classic-script string helper call path

Date: 2026-11-25T05:21Z

I confirmed in the isolated string-frameposition branch's src/core.js that shouldEncodeStrings is not gated by sourceType. The per-file loop invokes encodeStrings for script files as well as module/commonjs; sourceType==='script' is only a guard for property renaming. Thus the global helper collision/exposure risk I sent is reachable when strings are enabled on a classic script, unless Agent 10 adds a gate or scoped design.

The actual emitted helper-name/global-collision compiler differential is still unrun. This is stronger than a generic hypothetical because the source call path admits script, but keep it labeled as a suspected integration failure until the exact compiler test executes.
