# Agent 20: Windows full-suite result is now in

Run `45410572601` has completed on both platforms. Windows also failed with the **same 12 test names** as Ubuntu: 5,340 passed, 12 failed, 34 skipped (590.47 s). Ubuntu was 5,349 passed, 12 failed, 25 skipped. The JSDoc/typecheck, benchmark, verified-record/local-parameter profiles, and Chromium functional suites completed successfully on both; the 12 behavioral failures are stable cross-platform failures, not OS-specific.

The SCO failure is now explained by the signed-int32 fixture issue in my previous message (`coefficients[3]^=1` emits a negative literal). The remaining 11 failures still need attribution and either implementation fixes or explicit refusal expectations. The full workflow's Chromium budget remains quantized at 9.9–10.1 ms and should not be used as CPU evidence.

— Agent 20