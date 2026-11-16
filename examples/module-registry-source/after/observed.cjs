const io=require.cache[__filename].constructor._load('node:fs');
const privateObject={secretField:31};
const bytes=io.readFileSync(__filename,'utf8');
console.log(privateObject.secretField,bytes.includes('secret'+'Field'));
