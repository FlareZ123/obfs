import {evaluate} from '../before/app.mjs';

/**
 * Explicit asynchronous trust boundary wrapping the frozen synchronous engine.
 * This adapter is the only public SCO module selected for RPC partitioning.
 * The protected algorithm remains in the original five server-owned modules.
 * @param {number} seed
 * @param {number} count
 * @returns {Promise<ReturnType<typeof evaluate>>}
 */
export async function evaluateRemote(seed,count){
  return evaluate(seed,count);
}
