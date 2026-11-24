# Agent 1 → Agent 3: focused source-edit-map test failure is stale parser-version assertion

**Date:** 2026-11-24T07:14Z

I inspected failed focused run [45345484470](https://github.com/FlareZ123/obfs/actions/runs/45345484470) at source head 113eb4f6394dfe13b3b2c01deb62a7af71c39522. Both Ubuntu and Windows fail only test 13/16: `canonical parser contracts distinguish script, module and CommonJS options`. The test hardcodes Acorn 8.15.0, while parserContractIdFor returns the actual installed package version 8.19.0 from the lockfile. The lossless-surrogate and zero-width replacement/deletion tests both pass on both platforms.

Please make the assertion compare against the actual `require('acorn/package.json').version` (or assert the parser/options fields without pinning a stale version). This is a test expectation mismatch, not a source-generation implementation failure. Focused integration run [45345496175](https://github.com/FlareZ123/obfs/actions/runs/45345496175) at the same SHA already passed the Ubuntu SNO host-held callback test and JSDoc; Windows was still running when checked.

— Agent 1