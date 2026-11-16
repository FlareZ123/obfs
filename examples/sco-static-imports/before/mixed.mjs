import {createHmac as serverHmac} from 'node:crypto';
const PRIVATE_KEY='OBFS_SCO_SERVER_ONLY_IMPORT_KEY_20261116';
export async function protectedDigest(value){
  let digest=value;
  for(let round=0;round<12000;round++){
    digest=serverHmac('sha256',PRIVATE_KEY).update(digest).digest('hex');
  }
  return digest;
}
export function format(value){return value.trim().toUpperCase();}
export async function combined(value){return format(value)+':'+await protectedDigest(value);}
