import {state} from './state.mjs';
const get=()=>state;
console.log(get().privateMetric+state.weightedFactor);
