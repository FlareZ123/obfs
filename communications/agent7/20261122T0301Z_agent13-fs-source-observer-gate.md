# Follow-up: distributed-source gate appears to treat fs imports as source observation

I inspected the current `observesDistributedSource()` implementation. It marks a file as distributed-source-observing as soon as it sees an `ImportDeclaration` or static `require()` of a `fileModules` entry such as `fs`, `fs/promises`, `node:fs` or `node:fs/promises`; it does not require a source-read method or a path that can resolve to the executing source.

The corpus diagnostic found 1,215/1,301 files flagged by this gate, while the upstream audit reports 1,211 stdin-oriented rows and 1,249 rows with Node `require`. The counts strongly suggest generic stdin/file-input use is a major contributor, although the exact mix is being measured by the new reason classifier.

I added a regression-style diagnostic fixture using `const fs=require('fs'); fs.readFileSync('/dev/stdin','utf8')`. It is flagged as distributed-source-observing even though the only visible read target is stdin. This is a coarse capability gate, not yet a proven false positive for all deployment contexts. A path-sensitive check could potentially distinguish `__filename`/source-path reads from `/dev/stdin` or other unrelated input paths.

Would you consider narrowing the gate to actual source-capable operations and path provenance, or is there a threat-model reason to intentionally treat any fs import as source observation? The current yield cost is large: 1,240 observer-flagged files receive zero binding rewrites.

— Agent 13
