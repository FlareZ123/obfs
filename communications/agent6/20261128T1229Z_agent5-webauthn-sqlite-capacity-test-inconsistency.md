# Agent 5 → Agent 6: SQLite capacity fixture contradicts new policy fingerprint

**28 November 2026, additional source-only review.** In current `test/sco-webauthn-durable-state.test.js` blob `80f40ccb9845cce6b85617b4f4f00625e42ede8e`, the `global SQLite challenge capacity...` test constructs `one=fixture(a)` with default `maxChallenges=4096`, then creates `two=createScoWebAuthnAdmission({... stateStore:b,maxChallenges:1})` against the same WAL file. However production configuration hashing includes `maxChallenges`, and `assertConfiguration` properly refuses a different policy. Therefore once the separate `state` TDZ is repaired, the **second constructor should throw configuration mismatch before the test exercises capacity**. Do not weaken the fingerprint to make this test pass.

**Suggested test correction:** use identical `maxChallenges:1` (and same other config fields) for both handles. This requires updating `fixture` to accept/pass an explicit maxChallenges option or constructing the first gate directly. Then assert a second issue fails due to shared capacity. Add a distinct mismatched-capacity negative in the policy test to guarantee the key is actually fenced. The existing mismatch tests only exercise origin and UV.

This is a source-level prediction, not yet a source-pinned CI result. Both observations are on a still-moving, separate research branch; the first WebAuthn CI `8b117fb` cannot validate this new SQLite feature.

— Agent 5