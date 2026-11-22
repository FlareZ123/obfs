# Object.create descriptor member-read alias compatibility repair (intermediate, 22 November 2026)

**Scope:** This report concerns source-pinned correctness of the *draft* first-class `Object.create` decoder-integrity scanner in `src/core.js`, not a release security guarantee. It is independent of the mainline compiler and separate from compile-time speed improvements in draft PRs #289/#290. The protected-application strong-security goal remains **RELEASE-BLOCKED**.

## Source-visible counterexample

With `const descriptors={ref:{}}`, JavaScript's `const entry=descriptors.ref` refers to the *same descriptor object*. A later `entry.get=function(){return String.prototype}` makes that property a native accessor descriptor when `Object.create(null,descriptors)` executes. Accessing `box.ref` invokes the getter, exposing `String.prototype`. Assigning `box.ref.charCodeAt=()=>0` changes the behavior of any eager obfuscator-generated `String.fromCharCode` decoding dependent on the intrinsic.

The original draft `objectCreateMayExposeDecoderIdentifier` traversed the map's identifier aliases, direct member writes, and source expressions but omitted writes to the descriptor **entry object** reached through a member read. Compiler output then diverged from the native program in all three environments (COO/SNO/SCO). The same template substituting `Number.prototype` remained a positive string-encoding control.

A test-only branch snapshot `17fd26a62044c0dd45411789e1eb745859387afa` reproduces Agent42's independently supplied `test/agent42-object-create-descriptor-alias-write.test.js` (original test source `627f2308895c7db6b138590e09b593fec395edaa`) as `test/decoder-object-create-member-read-alias.test.js`. [Full Ubuntu/Windows baseline run 45051865260](https://github.com/FlareZ123/obfs/actions/runs/45051865260) showed all three String-sensitive member-read tests **RED on Ubuntu**, while the benign Number controls remained **GREEN**. This failure is a real native/emitted stdout mismatch, not a merely unmet rewrite-count expectation.

## Narrow fix

The proposed scanner derives a `descriptorMemberReadAliases` relation from source-visible initializer and assignment expressions such as `entry=descriptors.ref`. Each map-object identifier points to locally named aliases of its member values. `memberReadAliasWritesDecoderGetter` follows their transitive direct identifier aliases and scans `.get` writes for getter functions that may return a decoder-sensitive intrinsic. The existing descriptor-map provenance query checks this relation before accepting eager literal decoding. No generated runtime code or remote SCO protocol is directly changed by this analysis-only guard.

A second repair handles `Object.assign(entry,{get:function(){return String.prototype}})`: the member-read alias helper also examines `objectAssignSources` on each entry alias, recursively recognizing getter-bearing descriptor objects. A test-only snapshot `a88c086ca9b2546125b4e28adcc8f122503706a2`, [run 45052085885](https://github.com/FlareZ123/obfs/actions/runs/45052085885), showed **RED for all three String-sensitive Object.assign cases on Ubuntu** while the Number controls passed; the follow-up fix is `42f3a74f3745b3de6db200f3bb14d37d4de5843b`.

## Regression matrix and proof limits

The combined test covers the original direct identifier alias, member-read alias, assignment-based alias, computed literal bracket key, transitive identifier alias, Object.assign source construction, String-sensitive decoder mutation and benign Number.prototype positive encoding in SCO, COO and SNO. It also includes an unrelated sensitive descriptor object that must **retain** one ordinary encoded string to check against gratuitous whole-file refusal.

All relation edges are conservative *may-alias* edges keyed by spellings of AST identifiers, rather than a complete scope-aware, allocation-site or temporal points-to proof. Shadowing, reassignment, mutation after the `Object.create` call, and arbitrary reflective stores can cause conservative extra refusals or remain unmodeled. The scanner must be independently reviewed for remaining false negatives and safe positive yield. A complete flow-sensitive descriptor provenance analysis is beyond this narrowly scoped repair.

## Verification status

- Control `17fd26a62`: confirmed native/emitted RED on Ubuntu for COO/SNO/SCO member-read alias, Number controls GREEN. Windows was in progress at report creation.
- First member-read repair `ed24f86b0`: [full run 45051911024](https://github.com/FlareZ123/obfs/actions/runs/45051911024) confirmed Ubuntu full SUCCESS. Windows was in progress at report creation.
- Transitive bracket test `d65d054fc`: [run 45052044914](https://github.com/FlareZ123/obfs/actions/runs/45052044914).
- Object.assign new test, pre-fix `a88c086ca`: Ubuntu RED in [run 45052085885](https://github.com/FlareZ123/obfs/actions/runs/45052085885).
- Object.assign fix `42f3a74f`: [run 45052110505](https://github.com/FlareZ123/obfs/actions/runs/45052110505).
- Final positive-yield control `a7ae62068769ce95eb172723624558de45ea7e1a`: [run 45052203416](https://github.com/FlareZ123/obfs/actions/runs/45052203416).

Later statuses must be checked and recorded against their exact source commit, especially the final complete Ubuntu/Windows run before recommending integration. This is **intermediate engineering evidence** and cannot be promoted as an established obfuscation-security result.

## Destructured descriptor-entry alias: source-pinned red and green

A separate **source-pinned falsifier** demonstrates that destructuring is an equivalent entry reference: `const {ref:entry}=descriptors; entry.get=()=>String.prototype; Object.create(null,descriptors)`. The compiler without a destructuring read edge (test-only source `24f743d8df13cd4084975280fc989febf8f12f50`) produced native/emitted mismatches for all three String-sensitive modes while the Number.prototype controls passed in [Ubuntu run 45052655596](https://github.com/FlareZ123/obfs/actions/runs/45052655596). The narrow repair adds ObjectPattern identifier bindings sourced from another identifier to `descriptorMemberReadAliases`, including assignment-style patterns and unknown computed keys as conservative may aliases. With the new repair at `d6fc3b6af2bdbefa293b8a63a41de6be27e5b6a8`, [Ubuntu run 45052702468](https://github.com/FlareZ123/obfs/actions/runs/45052702468) completed successfully across the full validation suite. The paired Windows result was still pending at this report update. The real Chromium fixture now includes native/emitted ESM String-sensitive and Number-benign getter aliases, while a later full run will validate that expanded source.
