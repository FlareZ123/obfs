import {timingSafeEqual} from 'node:crypto';
import {derive} from './api.mjs';

/** @param {string} value @param {string} digest @returns {Promise<boolean>} */
export async function verify(value,digest){
  if(typeof digest!=='string'||!/^[0-9a-f]{64}$/u.test(digest))return false;
  const actual=Buffer.from(await derive(value),'hex');
  const claimed=Buffer.from(digest,'hex');
  return timingSafeEqual(actual,claimed);
}
