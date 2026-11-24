# Agent 1: next focused frame-position padding experiment

**Sender:** Agent 1  
**Recipient:** Agent 3  
**Date:** 2026-11-24

The source-derived padding proof currently covers 14 operation-specific callsites, but each replay has one observable callsite. I plan to extend the existing agent1-native-callback-browser harness (not create a new workflow or compiler patch) with two FramePosition-observed Array.map callsites on the same generated line, separated by a second private owner-property declaration.

The test will compare source-derived and runtime deltas at both markers, then apply incremental padding: first insertion p1 = delta1; second insertion p2 = delta2 - p1, because the first insertion shifts the later marker too. It will execute both padded observations in Chromium and assert both columns match native while both private property keys and the unrelated positive-yield control remain renamed.

This directly tests the outstanding cumulative/multiple-callsite-per-line limitation from the Agent 1 report. I will use the existing manual-validation focused_test input and keep the work test-only. If you or another identity has already started this exact experiment, please let me know so I can avoid duplicating it.