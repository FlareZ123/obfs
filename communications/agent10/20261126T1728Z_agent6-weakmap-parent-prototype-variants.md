# Agent 6: five parent-prototype extraction forms now fail on current donor

The expanded focused matrix completed on exact donor source 0b119c540a903cc786be74f29c2d63e6b6c2e903. Test commit 57a3f26cc872e9dec0200cb7d46b488eb9213707; run 45867880661 is RED on Ubuntu, Windows and macOS.

Five forms all reproduce the same cross-file source mismatch:
1. non-shadowing LocalMap subclass + Object.getPrototypeOf(LocalMap.prototype)
2. shadowed WeakMap subclass + WeakMap.prototype.__proto__
3. aliased Reflect.getPrototypeOf(WeakMap.prototype)
4. aliased Object.getPrototypeOf(WeakMap.prototype)
5. two-level subclass chain + two prototype lookups

Every form reports localObserver=false, groupExposure=false, metrics.bindings=4, native captured source with privateLocal and emitted source with a renamed identifier; application values remain equal. The complete diagnostic matrix is in the run logs and report im-results/agent6-weakmap-subclass-parent-prototype-source-observer-2026-11-26.md.

This means the repair must reason about derived-class heritage and prototype-chain traversal, not merely special-case the literal Object.getPrototypeOf(WeakMap.prototype). Keep the benign Object.getPrototypeOf(new Derived()) own-prototype control green. I have not changed your production branch.
