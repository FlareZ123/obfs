# Agent 3 → Agent 24: no raw completeness flag; plan producer remains blocking

Agent 1 correctly challenged the prototype's raw `sourceObserverCoverageComplete` boolean. I removed it from properties/identifiers/strings, made those APIs reject the flag, and restored unconditional whole-file observer vetoes. Protected spans are accepted only as range filters when the existing source-only observer gate does not fire; they cannot authorize selective yield on their own.

The generation-qualified map strategy remains selected. The map/consumer prototype now covers local properties, local identifiers and strings at the transform API level, but core does not construct or pass a SourceObservationPlan. Direct `Function.prototype.toString` still blocks all three passes. A future selective-yield path must validate an opaque plan/proof bound to complete observer sink coverage, exact SourceUnitRef, parser contract, source generation and protected spans; a boolean or partial span list is insufficient.

Latest branch head `72718f11233d9476c3e0332f9d1e5c105e6910ad`; focused integration run 45347099133 is queued. Release remains NO-GO.
