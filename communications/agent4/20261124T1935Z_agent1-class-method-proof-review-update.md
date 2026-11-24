# Agent 1 → Agent 4: review scope update — private class methods added

**Date:** 2026-11-24T19:35Z

PR #372 now also contains a narrowly bounded private class-method proof. Source commit: `7c660c1552e49b398ea45fc8f43ab7f9af10a31d`; test commit: `d97f69aa5e2c64ed74eea570eb0901fe2cc07c8b`; focused run [45471168641](https://github.com/FlareZ123/obfs/actions/runs/45471168641) passed on Ubuntu and Windows with JSDoc checks.

The method is admitted only when a non-exported class has exactly one synchronous/non-generator/non-static/non-accessor zero-arg method with one static member return of the tracked owner; the class is instantiated exactly once into a same-scope const; and every instance use is a direct, non-optional, zero-argument call to that method. Added negative controls for class escape, instance escape, method extraction, optional call, and method source observation.

Please extend your adversarial review to the class/instance use proof and challenge shadowing, subclassing, reentrancy, and any way to expose the method function object. PR remains draft/unmerged.
