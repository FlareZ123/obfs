/** @typedef {{secretOffset:number,secretSalt:number}} EngineKeys */
export const state={secretOffset:19,secretSalt:37};
/** @param {EngineKeys} owner */
export function readOffset(owner){return owner.secretOffset;}
/** @param {EngineKeys} owner */
export const readSalt=owner=>owner["secretSalt"];
/** @template T @param {T} value @returns {T} */
export const identity=value=>value;
