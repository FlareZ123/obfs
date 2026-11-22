# Defaulted Object.create descriptor-entry alias: native/compiled parity (intermediate, 22 November 2026)

**Agent:** 1  
**Branch:** `agent1/descriptor-default-entry-alias-20261122`, based on the draft integrated decoder-provenance branch at `ad8181af640c835c63041e6671e52e7de44ecbad`.  
**Status:** draft correctness repair; strong-obfuscation security release remains **BLOCKED**. This result does not certify current `main`.

## Native semantic counterexample

A destructuring default only initializes a binding when its selected source value is `undefined`. When the entry exists, each of the following reads the original shared descriptor object:

```js
const descriptors={ref:{}};
const {ref:entry={}}=descriptors;            // Also: assignment and computed "ref"
entry.get=function(){return String.prototype};
const box=Object.create(null,descriptors);
box.ref.charCodeAt=()=>0;
```

The target module then imports a long string value after the mutator runs. The native program prints the original `Z` string. An eagerly obfuscated decoder that uses `String.fromCharCode` after this mutation prints a different string. The draft scanner previously recorded `const {ref:entry}=descriptors` via its `descriptorMemberReadAliases` map, while it silently skipped `AssignmentPattern` properties such as `ref:entry={}`.

## Red-first reproducible result

Added `test/decoder-object-create-default-entry-alias.test.js` on a test-only source `eb8e2c4c3024ad1f6a8ddf982efbdad6c1fa366b`. The suite runs 18 native and transformed CommonJS cases: COO, SNO and SCO × declaration, assignment and computed-key destructuring × String-sensitive and benign Number getters. All groups compare stdout, exit status and stderr in separate Node processes, and assert the actual number of encoded target string literals.

[GitHub Actions run 45056699645](https://github.com/FlareZ123/obfs/actions/runs/45056699645) at the test-only source reported **nine String-sensitive native/emitted mismatches on Ubuntu**, one for each mode/form combination. The nine `Number.prototype` controls passed and retained eligible encoding. The Ubuntu behavioral step reported 4,485 passes, nine failures and one skip across 4,495 cases. The failure is actual divergent stdout, including repeated U+88E7 characters instead of the original `Z` characters. This is an emitted runtime correctness defect in the referenced draft source.

## Targeted fix and proof boundary

The candidate compiler patch at `83b58ff0bc13aaa8fb4e0394350e1fe0dc3739be` extracts an identifier from either a plain `Property.value` identifier or the `AssignmentPattern.left` identifier when registering descriptor member-read may-alias relations. Existing identifier alias propagation and getter-sensitivity logic then make the String mutation visible. Its additional compiler work is at analysis time; this is not a new runtime obfuscation layer.

The inference is conservative when the destructuring default actually executes, because the binding may then point to another object. Tracking that possible alias can decline eligible encoding, preserving correctness. The scanner still uses source-spelled, flow-insensitive may-alias sets; no complete scope-, realm- or execution-order-sensitive proof is claimed.

Post-fix [full run 45057060238](https://github.com/FlareZ123/obfs/actions/runs/45057060238) at `83b58ff0bc13aaa8fb4e0394350e1fe0dc3739be` passed **Ubuntu and Windows**, including all 18 new native/emitted Node cases, strict project/external JSDoc, normal performance steps and existing Ubuntu Chromium. A subsequent exact-source [full run 45057670374](https://github.com/FlareZ123/obfs/actions/runs/45057670374) at `09643afd0638f2fc0a5d99a7676d64c910588c6e` also passed **both operating systems**, including two newly added String/Number defaulted-destructuring cases in real Chromium (22 total `decoder-object-create-aliased-browser.js` cases). This is same-source integration of the repair with the extra browser fixtures, still on an unmerged draft branch.

An independent [browser-only run 45057494888](https://github.com/FlareZ123/obfs/actions/runs/45057494888) at the same `09643afd` code failed the `sco-spelling-mask-browser.js` source-only mask extractor's `report.matched` assertion; that fixture contains no defaulted descriptor destructuring. The full Node/Chromium validation independently passed. The browser-only failure is retained as an unresolved distinct diagnostic and is not evidence of defaulted-pattern regression.

## Integration and limits

This patch is isolated on a branch stacked on draft PR #293, #239 and #217. It must be reviewed and tested at any eventual composed source commit. No conclusion follows about source reconstruction, runtime extraction, hostile-server tamper resistance, or a universal 2.5× protected-compute bound. A small positive `Number.prototype` control ensures the repair can preserve eligible string encoding, but that alone does not establish improved attacker resistance.
