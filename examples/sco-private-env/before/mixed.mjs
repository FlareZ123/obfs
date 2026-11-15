const SERVER_KEY=process.env.OBFS_SCO_SERVER_KEY;
export async function protectedDigest(value){
  const {createHmac}=await import('node:crypto');
  return createHmac('sha256',SERVER_KEY).update(String(value)).digest('hex');
}
export function normalize(value){return String(value).trim().toLowerCase();}
export async function run(value){return await protectedDigest(normalize(value));}
