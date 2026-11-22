# Array-carried Object.create descriptor entries: cross-mode parity (intermediate, 22 November 2026)

**Agent:** 1  
**Branch:** `agent1/descriptor-array-entry-alias-20261122` stacked on the defaulted-entry candidate `09643afd0638f2fc0a5d99a7676d64c910588c6e`, which itself stacks on the draft PR #293 integrated decoder scanner.  
**Status:** reproduced native/emitted divergence; candidate fix under evaluation. This is compiler correctness work and does not change the primary **RELEASE-BLOCKED** security decision.

## Native semantic witness

The following is a valid source-visible may-alias path:

```js
const descriptors={ref:{}};
const [entry]=[descriptors.ref]; // Also direct assignment and defaulted binding
entry.get=function(){return String.prototype};
const box=Object.create(null,descriptors);
box.ref.charCodeAt=()=>0;
```

JavaScript's array literal holds the same descriptor entry reference. Destructuring yields the entry, so the later `entry.get` assignment makes the descriptor getter effective when `Object.create` executes. After the getter returns `String.prototype`, mutating `charCodeAt` affects unguarded eager string decoding in the later target module.

The draft `mutatesDecoderIntrinsic` descriptor provenance collector follows direct `const entry=descriptors.ref` and `const {ref:entry}=descriptors` reads, but previously did not record the array-literal carrier `[descriptors.ref]` and array-pattern result `[entry]`.

## Reproduced red-first matrix

Test-only SHA `456c8bf75afe22b53d2f8f752e210937f4a4913c` adds `test/decoder-object-create-array-entry-alias.test.js`: 18 independently executed native/emitted CommonJS cases covering COO, SNO and SCO × array declaration, assignment and computed-key default × String-sensitive getter or benign Number getter. All check exact process stdout/status/stderr and assert actual encoded string count.

[Run 45057583764](https://github.com/FlareZ123/obfs/actions/runs/45057583764) at that frozen test-only source confirms **nine real native-versus-emitted stdout mismatches on Ubuntu and the same nine on Windows**. In each case the String-sensitive program prints corrupted obfuscated output; the corresponding nine Number controls preserve parity and exactly one target string encoding. Ubuntu reported 4,503 passes/nine failures, Windows 4,500 passes/nine failures within the behavioral suite; unaffected skips explain the differing pass totals. This is a reproducible draft-branch correctness defect.

## Scoped candidate

Compiler SHA `4fa1f362c2d9d1b2cacc844063b879cc0c8cc168` additionally recognizes direct `ArrayPattern` bindings from direct `ArrayExpression` values at the same declared index when an element is a member read of an identifier. It records each such binding as a possible descriptor-entry alias and reuses the existing mutation-provenance checks. A defaulted binding is conservatively treated as possibly reading the source entry.

The proof only recognizes a small grammar. It does **not** establish soundness for arbitrary iterators, spread elements, unknown array aliases, runtime getter changes or host instrumentation. Under an overridden array iterator, positional syntax can bind a different object; the new edge remains a conservative may-alias rather than an assertion of equality. Preserving eligible Number controls is necessary positive-yield evidence, but does not establish broad decoder safety.

Post-fix [full two-platform run 45057986902](https://github.com/FlareZ123/obfs/actions/runs/45057986902) at `4fa1f362c2d9d1b2cacc844063b879cc0c8cc168` completed **SUCCESS on Ubuntu and Windows**: the 18 new Node matrix cases passed, along with the existing behavioral/adversarial tests, strict project and external JSDoc, the standard benchmark/profile steps and existing real Ubuntu Chromium. The direct-array behavior remains source-pinned to this exact version.

A later browser-fixture change `a7b2bc8da763a1da2360cd5956c2c113b3f2e0d9` adds two real Chromium parity cases (String-sensitive refusal and harmless Number positive encoding) for an array literal carried descriptor entry. Its new full two-platform run must pass at that source before the extra browser coverage can be called verified.

## Deliverable status

The patch is stacked on Agent 1's proposed defaulted-destructuring repair (draft PR #295) and Agent 5's unmerged decoder-provenance branches. Neither compiler preflight improvement establishes stronger source confidentiality, hostile-runtime integrity, or universally bounded 2.5× runtime overhead.
