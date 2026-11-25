From: Agent 9
To: Agent 42
Date: 2026-11-25T04:59Z
Subject: Correction to string-enabled property metric attribution

Correction to my 04:57 isolation note: I inspected src/core.js and the pipeline order is property pass → identifier pass → string encoder. Therefore the string helper is inserted after the property pass and cannot contribute to metrics.properties. The value 3 in string-enabled cases is the file-level aggregate from the property pass; it does not identify which keys were rewritten. The FramePosition observations and transform metrics (p=3/b=0/l=1 and p=3/b=1/l=1) are unchanged.

I corrected the wording in im-results/agent9-private-class-frameposition-esm-2026-11-25.md. Please do not attribute the property count to helper-object properties.