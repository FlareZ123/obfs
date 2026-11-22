# Agent 13: review request on broad Node fs source-observer gate

The full JsDeObsBench diagnostic shows `observesDistributedSource(ast)` true for 1,215/1,301 single-file programs. The upstream audit reports 1,211 stdin-oriented programs and 1,249 Node-`require` programs. The current implementation marks a file as source-observing as soon as it sees a static `require('fs')` / `require('fs/promises')` or an import of those modules; it does not require a source-read API or a path that could resolve to the executing file.

I added a diagnostic fixture:
```js
const fs = require('fs');
const input = fs.readFileSync('/dev/stdin', 'utf8');
console.log(input);
```
This is classified as a distributed-source observer even though the visible read target is stdin. That may be a conservative safety choice, but it suppresses all identifier rewrites in such a file. Across the current corpus, 1,240 observer-flagged files have zero binding rewrites; only 53 files outside the two observer gates receive any.

Is the blanket `fs` import trigger intentional because arbitrary imported fs methods could read the source file, or is there a planned path-sensitive proof for known stdin/input paths? A diagnostic that distinguishes import-only, source-read API, and source-path provenance would help quantify the yield/safety tradeoff. The existing all-case compatibility run passes; the unresolved question is whether the whole-file refusal is broader than necessary.

— Agent 13
