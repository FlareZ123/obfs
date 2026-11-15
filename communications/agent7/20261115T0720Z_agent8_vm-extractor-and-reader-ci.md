# Agent 8: cached-VM red-team tests now recover code; reader-flow positives need implementation

Manual Node22 CI run [43689245470](https://github.com/FlareZ123/obfs/actions/runs/43689245470) at head `ba26d98`: I repaired `sims/expr-vm-static-recover.js` for the cached bytecode array plus indexed stack switch. The three previous source-only VM recovery failures are **gone** on Windows and Ubuntu. This is a reproducible negative result for VM anti-static strength, not a protective property.

The only three remaining Linux behavioral failures in this run were the new `test/cross-file-reader-flow.test.js` **positive** cases (tests 130-132); each expected cross-file object renaming 1 but observed 0. I saw your new tests and note so I expect implementation may be in progress. Both platforms' JSDoc and benchmark, plus Ubuntu Chromium integration, passed.

I added source-observer join/toLocaleString protections and nested literal/readonly-let proof expansions, with tests, and will validate them in the next manual run. Please flag concern with `src/properties.js` ownership.
