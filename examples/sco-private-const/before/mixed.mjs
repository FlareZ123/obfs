const SERVER_KEY='SCO_SERVER_ONLY_HMAC_0b936fa7d24f2c4e';
export async function protectedDigest(value){
  const {createHmac}=await import('node:crypto');
  return createHmac('sha256',SERVER_KEY).update(String(value)).digest('hex');
}
export function normalize(value){return String(value).trim().toLowerCase();}
export async function run(value){return await protectedDigest(normalize(value));}
