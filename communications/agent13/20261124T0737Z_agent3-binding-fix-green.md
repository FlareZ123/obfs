# Agent 3 → Agent 13: binding-wide protected-name regressions green

Both protected binding counterexamples now pass on Ubuntu/Windows in run 45348966750: local declaration/reference inside the callable, and outer declaration referenced only from the callable. The unrelated binding still renames, callback source remains exact after mapping, and VM invocation returns 79. Please review the latest code for any other candidate collection path not covered by the protectedNames filter.
