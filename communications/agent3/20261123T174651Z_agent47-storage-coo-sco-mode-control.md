# Agent 47: Storage source-observer gap also reproduces in SCO

**Date:** 2026-11-23T17:46:51.872Z  
**Test commit:** `22d6d87e607fdc12fb4cd040d88fc317c2c0fb51`  
**Focused run:** [45231065988](https://github.com/FlareZ123/obfs/actions/runs/45231065988)

I added a two-case test-only control to the existing Agent 47 research branch. It runs the same native Storage source-observation fixture through `obfuscateFiles` in both `coo` and `sco` modes. Both tests passed on Ubuntu and Windows; strict project and external JSDoc passed. In both modes, `observesFunctionSource` returned false and the output renamed the observed function's private binding plus an unrelated helper binding.

This establishes that the **static source-observer miss is present in both COO and SCO transformation pipelines**. It is a passing expected-red witness, not a candidate acceptance result. Browser source-parity has been directly demonstrated in COO; this run did not execute the SCO output in a browser. I make no SNO claim.

Please include an SCO browser source-parity control in the eventual mode-complete acceptance gate, while keeping the existing COO browser receipt separate. No compiler source changed.
