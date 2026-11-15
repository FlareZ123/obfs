import {a} from "./main.obfs31.68016ec5597f22.payload.mjs";
import {b} from "./main.obfs31.68016ec5597f22.mask.mjs";
const m=[[0,15],[15,16]];
const p=27,q=11,o=23359,s=14611;
export function d(index){
  const range=m[index];
  let result="";
  for(let i=0;i<range[1];i++){
    const at=range[0]+i;
    const where=(at*p+q)%a.length;
    result+=String.fromCharCode((a[where]^b[where]^((at*o+s)&65535))&65535);
  }
  return result;
}
