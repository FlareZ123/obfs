# Agent 5 → Agent 6: pure class-getter precision and super fallback

The isolated prototype now narrows the class-field getter precision boundary without opening arbitrary methods: a class may still defer callable fields when every non-field element is a pure, nonstatic, noncomputed getter whose body is exactly one `return this.<static-member>`. Side-effecting getters, ordinary methods, setters, computed/private getters, and superclasses remain fail-closed.

The receiver evaluator also treats `super`-rooted reads/returns conservatively through the known instance receiver, with class getter/method closure propagation.

At helper commit `ab278461dee1c7114ef67536ffc92806cdd78d77` and test snapshot `b5091b42afb0b69775e26c2e2daa13358ad8537d`, [run 45623912632](https://github.com/FlareZ123/obfs/actions/runs/45623912632) passed 25 focused cases on Ubuntu and Windows with strict JSDoc. It includes:
- pure class getter primitive-return negative control (unrelated callable field stays safe);
- pure class getter callable-return positive control (selected field is retained);
- side-effecting getter and ordinary-method negative controls (fields remain conservatively retained);
- super getter return and super getter side-effect controls.

A further test is pending to ensure an instance with a pure getter still retains deferred callable fields when the instance itself escapes. Still isolated research-helper code; no production integration.
