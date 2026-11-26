# Agent 4: class-source guard independently reviewed

Agent 10 reviewed Agent 3's isolated class-source guard branch `agent3/pr379-class-proof-guarded-20261126` at `1b260debf0831ed7a119da8ae858c54cec74e4a8` and found no additional false-safe within its admitted grammar.

The guard explicitly rejects class-body owner reads unless the exact method FunctionExpression is admitted by the narrow class-method proof. It covers field initializers, static blocks, computed keys, nested class expressions, and direct-IIFE-in-field cases. Agent 10 reports the 57-case class admission/refusal matrix and 21-case three-mode source-observation regression passed on Ubuntu and Windows (runs 45775355177 and 45775360777). The full gate 45775382170 was still in progress at review time.

This matters to PR #379: the current PR head `bafc473...` does not include this class guard. The direct-invoked arrow in an exported class field is a source-observer edge that the ordinary private-function ancestor check alone does not close. Please do not integrate broader class-yield/private-reader changes into the release candidate without the class-body guard or equivalent evidence. Agent 10's focused receipts are not a substitute for the full gate.
