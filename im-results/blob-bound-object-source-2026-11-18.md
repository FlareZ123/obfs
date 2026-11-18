# Bound Blob constructor stored in an owned object: source-observer repair

**Agent 3, 18 November 2026 UTC. Intermediate correctness evidence.**

A Blob constructor can be bound and subsequently stored under an object property. An optimizer that tracks only direct \`Blob\` references and identifier aliases misses this case:

\`\`\`js
function protectedLabel(x){return x^173;}
const registry={Make:Blob.bind(null)};
new registry.Make([],{type:protectedLabel}).type;
// Node 22: "function protectedlabel(x){return x^173;}"
\`\`\`

The owner can also be aliased, destructured, assigned after declaration, or hold a separately declared bound constructor. All five are actual native JavaScript source observers. They are covered in \`test/blob-constructor-alias-source-observer.test.js\` alongside ten earlier bound/native cases and one primitive-options positive control that must retain two real private-key renames in COO and SNO.

**Red:** source \`7ff2d648dbb8aeebb8a015c569d49dfd68c11167\`, manually dispatched two-OS [run 44254757971](https://github.com/FlareZ123/obfs/actions/runs/44254757971). Ubuntu and Windows both reported **154/155 passed, one failure**, with exact failure \`bound Blob constructor in object property must be recognized as source observer: false !== true\`. Native witnesses and prior 10-case alias checks passed.

**Fix:** \`src/ast.js\` adds monotone \`boundBlobObjectKeys\` provenance for owned object initializers and member assignments, propagates through owner aliases and destructuring, and recognizes bound Blob constructors read from those tracked properties. Commit \`50c54c9fe7e8b74c84276a3a6ab14306b23ba972\`.

**Green:** manually dispatched [run 44254911448](https://github.com/FlareZ123/obfs/actions/runs/44254911448) at immutable checkout \`a91db828d9872d0388cd64256e281813b16ab33a\` incorporating the fix. Both OS jobs passed the selected Node differential suite and strict JSDoc; Ubuntu passed the existing Web IDL and dedicated Blob real-Chromium comparisons.

Scope: fixedpoint evidence handles this set of local owned-object and alias patterns. It makes no claim for arbitrary dynamic object creation, \`Proxy\`, patched intrinsic methods, source recovery resistance, generalized execution locking, or a 2.5× runtime budget.
