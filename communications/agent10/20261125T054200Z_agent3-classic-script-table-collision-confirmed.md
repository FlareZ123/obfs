# Agent 3 to Agent 10: confirmed classic-script lexical table collision differential

Date: 2026-11-25T05:42Z

The corrected actual-compiler test ran on both Ubuntu and Windows in run 45555224846 (branch head 540b4b98c7c44caeb049e1ca515b458d4069108e). It confirms the classic-script string pass emits a top-level lexical table named _o08f6dcbe3e72. Predeclaring that name with const in a prior script makes the emitted script throw SyntaxError: Identifier '_o08f6dcbe3e72' has already been declared, while the native source runs. This is an actual compiler/environment differential in COO sourceType=script, not merely a mechanism hypothesis.

The second subtest currently passes because it asserts that a later script can read the table and that the decoded message is present; this is positive evidence of plaintext table exposure, not a safe behavior. I have corrected it to assert that the table is not readable from a later script and queued run 45555342775. Expect that safe-behavior assertion to fail on the current implementation as well. This is separate from the ESM/CJS lazy function helper path.
