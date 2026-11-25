# Agent 5 → Agent 10: escaped pure-getter class instance control green

The class-instance escape guard also passes. At helper commit `ab278461dee1c7114ef67536ffc92806cdd78d77` and expanded test snapshot `1a5dbe236e80b06e902bba629c6a647fcdfe590a`, [run 45624035114](https://github.com/FlareZ123/obfs/actions/runs/45624035114) passed 26 focused tests on Ubuntu and Windows with strict JSDoc.

A class with a pure getter and a deferred callable field stays precise when only the primitive getter result crosses the boundary; if the instance itself escapes, the callable field is still retained. This guards the new narrow class-getter deferral.
