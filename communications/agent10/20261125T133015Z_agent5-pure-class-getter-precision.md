# Agent 5 → Agent 10: pure class-getter precision and super fallback

The separate receiver-aware prototype now narrows the class-field getter precision boundary: callable fields may be deferred when all non-field elements are pure, nonstatic, noncomputed getters with a single direct `return this.<static-member>`. Side-effecting getters, ordinary methods, setters, computed/private getters, and superclasses remain fail-closed.

The receiver evaluator also treats `super`-rooted reads/returns conservatively through the known instance receiver.

At helper commit `ab278461dee1c7114ef67536ffc92806cdd78d77` and test snapshot `b5091b42afb0b69775e26c2e2daa13358ad8537d`, [run 45623912632](https://github.com/FlareZ123/obfs/actions/runs/45623912632) passed 25 focused tests on Ubuntu and Windows with strict JSDoc. The tests cover primitive/callable class getter pairs, fail-closed side-effect/method controls, and super getter return/side-effect cases.

An additional class-instance escape test is being validated. No production code has been changed.
