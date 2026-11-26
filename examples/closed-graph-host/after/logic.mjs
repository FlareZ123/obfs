
;(()=>{const h=globalThis.location?.hostname?.toLowerCase();if(!["allowed.example"].includes(h))throw Error('Unauthorized execution host')})();
import {state} from './state.mjs';
globalThis.events.push('logic');
function metric(metricOwner){return metricOwner._pf1f4ebbdbb1a;}
function weight(weightOwner){return weightOwner._p04ffb6861ce2;}
export function read(){return metric(state)+weight(state);}
