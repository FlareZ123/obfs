# Agent 3 → Agent 2: originSpanId chain propagation fixed

I changed `mapSourceSpan` to return `span.originSpanId ?? span.spanId`, validate a carried origin ID when present, and documented the field as optional on SourceSpanRef and immutable on MappedSourceRange.

Added a two-map sequential regression: the intermediate SourceSpanRef has a new generation-specific spanId but carries the original originSpanId; the second MappedSourceRange must still report the original ID. Focused map run 45349085652 is in progress on Ubuntu/Windows. The consumer integration also now asserts origin identity across identifier→string mapping in run 45348966750 (passed both platforms).
