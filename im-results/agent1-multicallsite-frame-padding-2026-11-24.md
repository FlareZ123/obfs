# Same-line cumulative frame-position padding across multiple callsites

**Status:** Intermediate empirical result; test-only padding, not a production emitter feature.  
**Owner:** Agent 1  
**Date:** 2026-11-24

## Summary

The existing Chromium frame-position witness was extended with two synchronous Array.map callsites on the same generated source line. A private-property rewrite before the first callsite and a second private-property rewrite between the callsites produce different cumulative source-column deltas.

The test derives both deltas from the original and obfuscated source, confirms each matches the runtime hidden-frame column delta in Chromium, then applies incremental padding. Both padded runtime columns match their respective native columns.

This validates the cumulative arithmetic for this controlled two-callsite case. It does not implement padding in the production emitter.

## Reproduction

- Existing harness extended: test/agent1-native-callback-browser.js
- Existing test wrapper: test/agent1-native-callback-browser.test.js
- Manual workflow: .github/workflows/manual-validation.yml, focused_test input
- Run: [45334865637](https://github.com/FlareZ123/obfs/actions/runs/45334865637)
- Final-branch test commit: b575d511e7010532b41a9a6c977b667fc863eb26
- Ubuntu Chromium test: passed.
- Windows: the Chromium test is intentionally skipped because Chromium is provisioned only on the Ubuntu runner; project JSDoc, external JSDoc, and paired-budget JSDoc all passed on Windows.
- No new workflow or test harness was created.

## Fixture

The CommonJS fixture is emitted as one line and contains:

1. A private owner object with longPrivatePropertyName before the first Array.map callsite.
2. The first synchronous map callback, which calls an external observer while hidden() is active.
3. A second private owner object with anotherLongPrivatePropertyName between the callsites.
4. The second synchronous map callback, which calls the same external observer while hidden() is active.
5. Reads of both private properties after the callsites, plus an unrelated plain() positive-control property.

The external observer records the active hidden() stack frame. It selects the first or second invocation in separate browser runs so the two callsite columns can be measured independently.

The obfuscation run uses COO, closed-world analysis, properties enabled, identifiers disabled, and strings disabled. The test requires at least three property rewrites and confirms all three original property names are absent from emitted source.

## Cumulative padding arithmetic

Let the source and emitted columns at the two callsite markers be s1, s2 and c1, c2. The measured deltas are:

    d1 = s1 - c1
    d2 = s2 - c2

The first private-key rewrite shifts both later callsites. The second private-key rewrite occurs between the callsites, so the second delta includes both shrinkages. The test requires d2 > d1.

If padding p1 is inserted immediately before the first marker, it also shifts the second marker by p1. Therefore the second insertion must be incremental:

    p1 = d1
    p2 = d2 - p1

More generally, for ordered callsites, each incremental insertion is the current source-derived delta minus the cumulative padding already inserted before that callsite.

The test:
- asserts both source-derived deltas equal the corresponding Chromium runtime frame-column deltas;
- asserts both incremental pads are positive;
- inserts p1 before the first marker and p2 before the second marker in the already-padded output;
- verifies both static marker columns are restored;
- executes the padded code in Chromium for both selected callback invocations;
- asserts both padded runtime columns equal the native columns and both application results remain 3.

## Evidence and limits

This establishes that a naive strategy of inserting the full original delta before every marker would over-pad later callsites; later insertions must account for earlier padding. The test demonstrates the incremental rule for two callsites on one line with an intervening source shrink.

It does not establish:
- a general AST-aware source-to-output callsite mapping;
- correctness for arbitrary numbers of callsites, nested transforms, comments, templates, Unicode, CRLF, ASI, or code-generation expansions;
- behavior in browsers other than the Chromium runner;
- performance or the 2.5× runtime budget;
- automatic production padding.

The current implementation is a test-only whitespace insertion helper keyed by unique marker strings. A production implementation needs stable callsite identities and a cumulative position map over the final emitted source, not marker text search.

## Next work

Extend the test to three or more callsites, include an expansion between two shrinkages, and test callsites on different lines. Then derive an AST-node-based position map that can be applied after all transforms and code generation, while ensuring padding does not change tokenization or semantics.

## Four-callsite mixed-edit and UTF-16 extension

The focused harness was extended on the same test-only branch to close the next bounded position-mapping witness:

- Source commit: 59b959d516886a1e94b7febe12e4b5a584527873.
- Successful focused run: https://github.com/FlareZ123/obfs/actions/runs/45344447616.
- Ubuntu: the Chromium differential executed and passed.
- Windows: the focused browser test was skipped by the existing explicit platform guard; project, external and paired-budget JSDoc checks passed.
- The comprehensive node22 job was skipped because this was a focused-test dispatch.
- Node: v22.23.4.

The fixture contains four callback callsites: three on one line and a fourth on a separate line. An astral Unicode character precedes each marker. The first owner key shrinks, a short tinyKey expands between the first and second callsites, and a third long key shrinks before the third callsite. A fourth long key on the next line provides a separate line-local case. Four owner keys plus an unrelated positive-control property are all renamed (properties=5), and native/emitted application results remain 3.

The exact source-derived UTF-16 column deltas matched the Chromium runtime frame-column deltas at all four callsites:

| Callsite | Source position (line, zero-based column) | Emitted position | Source/runtime delta |
|---|---:|---:|---:|
| 1 | (3, 59) | (3, 50) | 9 |
| 2 | (3, 194) | (3, 192) | 2 |
| 3 | (3, 312) | (3, 294) | 18 |
| 4 | (4, 66) | (4, 51) | 15 |

The signed incremental corrections were **[+9, -7, +16, +15]**:
- insert nine spaces before callsite 1;
- remove seven spaces from the reserved whitespace immediately before callsite 2, compensating for the short-key expansion after the first insertion;
- insert sixteen spaces before callsite 3;
- insert fifteen spaces before callsite 4 on its separate line.

After correction, all four static line/column positions exactly matched the original UTF-16 positions, and four independent Chromium executions confirmed that every padded runtime frame line and column matched its native counterpart. The machine record was: sourceDeltas=[9,2,18,15], runtimeDeltas=[9,2,18,15], incrementalPads=[9,-7,16,15], properties=5, allRuntimePositionsRestored=true.

This is a stronger bounded witness than the earlier two-callsite test: it exercises cumulative corrections across three same-line callsites, a shrink→expansion→shrink sequence, a different-line callsite, astral Unicode, and a negative correction that consumes only an explicitly reserved whitespace run. It still uses unique marker strings and a fixture-specific whitespace reserve. It is **not** a production AST-aware callsite identity or position map, and does not establish correctness for arbitrary formatting, CRLF, inserted newlines/prologues, multiple engines, or general generated-code expansion. FramePosition remains a distinct map obligation from ExactSource span relocation.
