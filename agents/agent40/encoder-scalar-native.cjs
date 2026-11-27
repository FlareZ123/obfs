(()=>{
'use strict';
function bytesFor(cp){
 if(cp<=127)return [cp];if(cp<=2047)return [192|(cp>>6),128|(cp&63)];if(cp<=65535)return [224|(cp>>12),128|((cp>>6)&63),128|(cp&63)];return [240|(cp>>18),128|((cp>>12)&63),128|((cp>>6)&63),128|(cp&63)];
}
function expectedUnits(s){
 const units=[];
 for(let i=0;i<s.length;i++){
  let cp=s.charCodeAt(i),read=1;
  if(cp>=0xd800&&cp<=0xdbff){const b=s.charCodeAt(i+1);if(b>=0xdc00&&b<=0xdfff){cp=0x10000+((cp-0xd800)<<10)+(b-0xdc00);read=2;i++;}else cp=0xfffd;}
  else if(cp>=0xdc00&&cp<=0xdfff)cp=0xfffd;
  units.push({bytes:bytesFor(cp),read});
 }
 return units;
}
const r={scalarStrings:0,loneSurrogateStrings:0,randomStrings:0,encodeCalls:0,encodeIntoCalls:0,mismatches:0,firstMismatches:[]},encoder=new TextEncoder();
const dests=Array.from({length:65},(_,i)=>new Uint8Array(i));
function equal(actual,expected){if(actual.length!==expected.length)return false;for(let i=0;i<actual.length;i++)if(actual[i]!==expected[i])return false;return true;}
function check(s,units,caps,context){
 const full=units.flatMap(u=>u.bytes),encoded=encoder.encode(s);r.encodeCalls++;
 if(!equal(encoded,full)){r.mismatches++;if(r.firstMismatches.length<10)r.firstMismatches.push({context,op:'encode',actual:[...encoded],expected:full});}
 for(const cap of caps){
  let read=0,written=0;const dest=dests[cap];dest.fill(165);const expected=new Array(cap).fill(165);
  for(const unit of units){if(written+unit.bytes.length>cap)break;for(const b of unit.bytes)expected[written++]=b;read+=unit.read;}
  const out=encoder.encodeInto(s,dest);r.encodeIntoCalls++;
  if(out.read!==read||out.written!==written||!equal(dest,expected)){r.mismatches++;if(r.firstMismatches.length<10)r.firstMismatches.push({context,op:'encodeInto',cap,actual:{...out,bytes:[...dest]},expected:{read,written,bytes:expected}});}
 }
}
for(let cp=0;cp<=0x10ffff;cp++){
 if(cp>=0xd800&&cp<=0xdfff)continue;const s=String.fromCodePoint(cp);r.scalarStrings++;check(s,[{bytes:bytesFor(cp),read:s.length}],[0,1,2,3,4],{cp});
}
for(let unit=0xd800;unit<=0xdfff;unit++){r.loneSurrogateStrings++;check(String.fromCharCode(unit),[{bytes:bytesFor(0xfffd),read:1}],[0,1,2,3,4],{unit});}
let x=0x6a09e667;function rand(){x^=x<<13;x^=x>>>17;x^=x<<5;return x>>>0;}
for(let seq=0;seq<100000;seq++){
 const units=Array.from({length:rand()%32},()=>rand()&65535);if(seq%4===0)units.push(0xd800,0xdc00,0xdfff,0xd800,65);if(seq%7===0)units.unshift(0xfeff,0);const s=String.fromCharCode(...units);r.randomStrings++;check(s,expectedUnits(s),[rand()%65,rand()%65],{seq,units});
}
return r;
})()
