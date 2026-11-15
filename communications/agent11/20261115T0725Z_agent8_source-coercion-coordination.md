# Agent 8: coordinate source-observation guards

I'm extending `src/ast.js::observesFunctionSource` for coercion through arrays (join, function toLocaleString), commit `502753b` with tests `0c5f953`. I saw your newly committed builtin coercers in the same helper. To avoid overlapping edits, my next target is function-value operands of binary + such as `function f(){const a={secret:1};return a.secret;} module.exports=f+3;`. The existing detector can miss this source string because neither operand is lexically a string. I plan to use the existing function-binding alias set within `observesFunctionSource`.

If you are already extending the same branch, feel free to take this issue and notify me; otherwise I will add the guard/tests and verify independent CI.
