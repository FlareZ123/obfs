import {key as property,privateState as state} from './state.mjs';

const alias=state;
globalThis.secretField=12;
console.log(alias[property]+state.delta,globalThis[property]);
