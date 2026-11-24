# Stable-callsite FramePosition projection witness (intermediate)

**Date:** 2026-11-24 07:14 UTC  
**Branch:** `agent3/source-edit-map-20261124`  
**Test commit:** `cbaddcc24ecea610312f89164e129ff5c9dcb6d8`  
**Focused run:** [45346232582](https://github.com/FlareZ123/obfs/actions/runs/45346232582) — passed on Ubuntu and Windows.

## Purpose

This test closes a bounded integration obligation: project original callback callsite positions through the selected generation-qualified SourceEditMap chain using stable callsite identities, not source marker strings. It is test-only; it does not add a production FramePositionMap implementation or SourceObservationPlan producer.

## Reproduction

Test: `test/frame-position-map-projection.test.js`.

- The fixture has four Array.map callsites: three on one line and one on another. Each has an astral Unicode character before it.
- The test derives fixture CallSiteRefKeys from AST semantics (the numeric ArrayExpression receiver), not marker strings or source offsets. Each original CallSiteRef is paired with a generation-specific SourceSpanRef.
- The first pass renames eight property-key/member identifiers: a long key shrinks, a short key expands, a later long key shrinks, and a fourth long key on another line shrinks. The source map relocates each original callsite span, verifies its originSpanId, and the test reparses and re-identifies the same callsite keys.
- The source-derived UTF-16 column deltas are `[21, 9, 37, 27]`. The signed line-local corrections are `[+21, -12, +28, +27]`: insert before callsite 1, remove twelve characters from a proven whitespace-only reserve before callsite 2, insert before callsite 3, and insert independently before callsite 4.
- A second SourceEditMap records the padding edits. The test reparses again, maps each generation-specific callsite span, and builds a test-only FramePositionMap keyed by stable CallSiteRefKey, carrying sourceUnitRef, from/to generations, original/current span IDs, and original/final line-column pairs.
- All four final UTF-16 line/column pairs equal their originals. The original, renamed, and padded programs all execute to the same result (`3`).
- A separate negative test inserts a synthetic helper prologue with a newline. The ExactSource span still maps successfully, but its line number changes. This explicitly demonstrates that SourceEditMap span relocation is not a FramePosition preservation proof.

## Validation

- Ubuntu: 2 tests passed; project, external and paired-budget JSDoc checks passed.
- Windows: 2 tests passed; project, external and paired-budget JSDoc checks passed.
- Node v22.23.4 on both. The comprehensive `node22` job was skipped because this was a focused-test dispatch.
- The independent Chromium runtime witness remains [45344447616](https://github.com/FlareZ123/obfs/actions/runs/45344447616), which exercised four real browser frames with source/runtime deltas `[9, 2, 18, 15]` and corrections `[+9, -7, +16, +15]`.

## Limits and next requirements

This test's callsite keys are fixture-specific semantic keys, not a production immutable CallSiteRefKey from a plan producer. The FramePositionMap is an in-test projection, not a production API. The test does not establish runtime-specific stack formatting, CRLF behavior, line-count restoration, multi-module/SCO response generation, or direct Function.prototype.toString selective-yield behavior. The direct source observer gates in `src/identifiers.js` and `src/strings.js` still need plan-backed integration; an arbitrary caller-supplied span list must not bypass those gates without a completeness-validated plan.

Before candidate acceptance, integrate the projection with the immutable SourceObservationPlan producer, use the plan's stable CallSiteRefKey/sourceSpanId, bind a declared runtime/formatter contract, and fail closed when negative corrections lack safe whitespace or line-number changes cannot be reversed. Keep FramePosition separate from ExactSource, SourceBytes and CallableMetadata closures.

**Status:** intermediate evidence only; no release or candidate acceptance claim.


## CRLF extension

A third focused test was added to the same projection harness. It converts the fixture to CRLF, reparses it under the same parser contract, performs the same AST-derived property edits, and maps the same four stable callsite keys through the edit map. The test verifies that each callsite line remains stable and that the UTF-16 column deltas remain `[21, 9, 37, 27]` despite CRLF line endings and astral characters.

- Test: `projects stable callsite spans through CRLF sources with astral UTF-16 columns`.
- Successful focused run: [45346899863](https://github.com/FlareZ123/obfs/actions/runs/45346899863).
- Ubuntu: 3/3 tests passed; project/external/paired-budget JSDoc passed.
- Windows: 3/3 tests passed; project/external/paired-budget JSDoc passed.
- Node v22.23.4 on both platforms; comprehensive node22 job skipped.

This adds CRLF static-coordinate coverage only. It does not establish runtime stack column behavior for CRLF on Chromium or other engines.
