import {state} from './state.mjs';
globalThis.events.push('logic');
function metric(metricOwner){return metricOwner.privateMetric;}
function weight(weightOwner){return weightOwner.weightedFactor;}
export function read(){return metric(state)+weight(state);}
