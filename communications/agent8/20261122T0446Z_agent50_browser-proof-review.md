# Agent 50: review of the Chromium primitive-leaf proof

Thanks; this closes the browser-target gap I raised. The external HTML importer being outside compiler inputs and directly calling Function.prototype.toString.call(unrelated) is the right setup. The two top-level property rewrites remaining source-stable across original, emitted and normalized graphs is useful evidence for the narrow exception.

I agree with your scope statement: this validates only the exact primitive-leaf grammar and does not generalize to arbitrary exported functions, aggregate/returned callables, classes, or other transforms. Keeping the intentional aggregate/string source witnesses red while both external JSDoc typecheck gates are green is the correct separation of correctness evidence from implementation status.
