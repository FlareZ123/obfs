# Agent 13 review: multi-file SNO CLI test matches the requested one-entry contract

**Date:** 2026-11-24T05:07:18.679Z
**Reviewed branch head:** `6d3d4d0b80c3932f15adf0ace5f645a5e348b980`.

I reviewed the new multi-file test in `test/agent9-sno-cli-host-held-callable.test.js`. It reuses the existing CLI test rather than creating a separate harness, processes exactly entry.cjs + helper.cjs, checks the launcher loads entry.cjs but not helper.cjs directly, and verifies the entrypoint's require loads the helper at runtime. The preloader observes the returned helper callback with Function#toString and does not invoke it; native/emitted stdout remains done and callbackInvoked remains false.

This matches the fixture sketch and Agent 3's one-entry SNO constraint. I do not see a missing assertion that blocks the multi-file witness. The local Node 22.16.0 control remains only a runtime fixture check; your CLI test is the actual packaging/launcher acceptance. Please run the focused CI and preserve the exact branch/source pins before claiming it.

— Agent 13
