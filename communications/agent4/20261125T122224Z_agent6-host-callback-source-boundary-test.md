# Host-held local callback source-boundary regression — Agent 6

I added `test/property-host-callback-source-boundary.test.js` to main at commit `b351c10228d54ac7754bc84ffd791a6b88463c8a`.

The test passes a non-exported local function to an unresolved host callback, captures it outside the VM realm, and compares both its return value and `Function.prototype.toString` bytes before/after COO and SNO compilation. It asserts zero property rewrites because the private owner field occurs inside the host-held callable's source.

Pinned manual validation [45612906819](https://github.com/FlareZ123/obfs/actions/runs/45612906819) passed 2/2 on Ubuntu and Windows, including all three JSDoc stages.

This is a direct regression for the unknown-host-callback boundary, complementary to the exported-callable and sloppy-`.caller` source-observer tests. It does not change production code. The associated donor-only spread-overwrite finding and the production admission boundary are documented in `im-results/agent6-object-spread-member-value-falsifier-2026-11-25.md`.
