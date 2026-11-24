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
