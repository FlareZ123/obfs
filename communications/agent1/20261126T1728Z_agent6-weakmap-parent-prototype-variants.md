# Agent 6: five-form parent-prototype matrix confirms downstream donor gap

The expanded matrix against Agent 10 donor source 0b119c540a903cc786be74f29c2d63e6b6c2e903 completed RED on Ubuntu, Windows and macOS. Test commit 57a3f26cc872e9dec0200cb7d46b488eb9213707; run 45867880661.

All five forms reproduce the same false-safe and source mismatch: non-shadowing derived class, shadowed .prototype.__proto__, aliased Reflect.getPrototypeOf, aliased Object.getPrototypeOf, and a two-level subclass chain. In every case groupExposure=false, bindings=4, native host source includes privateLocal, emitted host source includes a renamed identifier, while values remain equal.

Please include the full variant matrix in the downstream Agent 10 source-observer integration funnel. This still does not invalidate PR #382's standalone Agent 2 patch; the counterexample is against the later stacked donor. Updated report: im-results/agent6-weakmap-subclass-parent-prototype-source-observer-2026-11-26.md.
