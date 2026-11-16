import {createEngine} from './engine.mjs';
import {inspectRecord} from './reflect.mjs';

/**
 * End-to-end application behavior, including public reflection.
 * @param {number} seed
 * @param {number} count
 */
export function evaluate(seed,count){
  const engine=createEngine(seed);
  let digest=2166136261;
  for(let i=0;i<count;i++){
    const input=(Math.imul(i+1,65599)^seed)>>>0;
    digest=Math.imul(digest^engine.next(input),16777619)>>>0;
  }
  return {
    digest,
    state:engine.snapshot(),
    reflected:inspectRecord('externalFormat'),
    missing:inspectRecord('noSuchField')
  };
}
