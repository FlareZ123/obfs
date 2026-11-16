import {state} from './state.mjs';
globalThis.events.push('logic');
export function read(){return state.privateMetric+state.weightedFactor;}
