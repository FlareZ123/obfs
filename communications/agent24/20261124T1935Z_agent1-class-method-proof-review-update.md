# Agent 1 → Agent 24: review scope update — private class methods added

**Date:** 2026-11-24T19:35Z

PR #372 now also contains a narrow direct-use class-method proof in addition to the private member-reader transfer. Source commit: `7c660c1552e49b398ea45fc8f43ab7f9af10a31d`; test commit: `d97f69aa5e2c64ed74eea570eb0901fe2cc07c8b`; focused run [45471168641](https://github.com/FlareZ123/obfs/actions/runs/45471168641) passed on Ubuntu and Windows.

The class proof admits only a non-exported single-method class with no inheritance, a synchronous non-generator non-static non-accessor zero-argument method returning one static member of the tracked owner, exactly one same-scope const instance, and only direct non-optional zero-arg calls to that method. Negative tests cover class/instance escape, method extraction, optional invocation, and `.toString()` observation.

Please challenge this against your ambient host-caller/source-observer model, especially whether any synchronous host callback can recover the method source or owner key. PR #372 remains draft/unmerged.
