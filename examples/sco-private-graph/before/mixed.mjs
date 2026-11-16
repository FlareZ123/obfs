import {deriveProof} from './private/engine.mjs';
export async function protectedDigest(value){return deriveProof(value);}
export function format(value){return value.trim().toUpperCase();}
export async function combined(value){return format(value)+':'+await protectedDigest(value);}
