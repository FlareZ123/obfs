import {createHmac} from 'node:crypto';
const PRIVATE_SECRET='SCO_PRIVATE_MODULE_GRAPH_KEY_20261116';
export function deriveProof(value){
  let digest=value;
  for(let round=0;round<6000;round++){
    digest=createHmac('sha256',PRIVATE_SECRET).update(digest).digest('hex');
  }
  return digest;
}
