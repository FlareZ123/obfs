import {calculateDigest} from './secret.mjs';

/** @param {string} value @returns {Promise<string>} */
export async function derive(value){
  return await calculateDigest(value);
}
