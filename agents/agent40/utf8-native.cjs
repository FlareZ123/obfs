'use strict';
// Independent strict UTF-8 scalar parser. Null means malformed input.
function scalarValues(bytes){
  const out=[];
  for(let i=0;i<bytes.length;){
    const a=bytes[i++];let n,cp,min;
    if(a<=0x7f){out.push(a);continue;}
    if(a>=0xc2&&a<=0xdf){n=1;cp=a&31;min=0x80;}
    else if(a>=0xe0&&a<=0xef){n=2;cp=a&15;min=0x800;}
    else if(a>=0xf0&&a<=0xf4){n=3;cp=a&7;min=0x10000;}
    else return null;
    if(i+n>bytes.length)return null;
    while(n--){const b=bytes[i++];if((b&0xc0)!==0x80)return null;cp=(cp<<6)|(b&63);}
    if(cp<min||cp>0x10ffff||(cp>=0xd800&&cp<=0xdfff))return null;
    out.push(cp);
  }
  return out;
}
function encodeScalar(cp){
  if(cp<=0x7f)return Uint8Array.of(cp);
  if(cp<=0x7ff)return Uint8Array.of(0xc0|(cp>>6),0x80|(cp&63));
  if(cp<=0xffff)return Uint8Array.of(0xe0|(cp>>12),0x80|((cp>>6)&63),0x80|(cp&63));
  return Uint8Array.of(0xf0|(cp>>18),0x80|((cp>>12)&63),0x80|((cp>>6)&63),0x80|(cp&63));
}
function nativeAudit(){
  const fatal=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
  const fatalBOM=new TextDecoder('utf-8',{fatal:true});
  const replace=new TextDecoder('utf-8',{ignoreBOM:true});
  let scalarCount=0,scalarFailures=0,scalarFirst=null;
  for(let cp=0;cp<=0x10ffff;cp++){
    if(cp>=0xd800&&cp<=0xdfff)continue;
    const bytes=encodeScalar(cp),expected=String.fromCodePoint(cp);
    scalarCount++;
    try{if(fatal.decode(bytes)!==expected||fatalBOM.decode(bytes)!==(cp===0xfeff?'':expected)||scalarValues(bytes)?.[0]!==cp){scalarFailures++;scalarFirst??=cp;}}
    catch(e){scalarFailures++;scalarFirst??=cp;}
  }
  let valid=0,invalid=0,fatalFailures=0,firstFatalFailure=null;
  const replacement=[];
  function check(bytes){
    const parsed=scalarValues(bytes);const expected=parsed===null?null:String.fromCodePoint(...parsed);
    if(parsed===null)invalid++;else valid++;
    let success=false,value,errorName;
    try{value=fatal.decode(bytes);success=true;}catch(e){errorName=e.name;}
    if(expected===null?(success||errorName!=='TypeError'):(!success||value!==expected)){
      fatalFailures++;firstFatalFailure??={bytes:[...bytes],expected,success,value,errorName};
    }
    replacement.push(replace.decode(bytes));
  }
  check(Uint8Array.of());
  for(let a=0;a<256;a++){check(Uint8Array.of(a));for(let b=0;b<256;b++)check(Uint8Array.of(a,b));}
  let state=0x6a09e667;
  function rnd(){state^=state<<13;state^=state>>>17;state^=state<<5;return state>>>0;}
  for(let i=0;i<100000;i++){
    const n=rnd();check(Uint8Array.of(n&255,(n>>>8)&255,(n>>>16)&255));
    const m=rnd();check(Uint8Array.of(m&255,(m>>>8)&255,(m>>>16)&255,(m>>>24)&255));
  }
  return {scalarCount,scalarFailures,scalarFirst,valid,invalid,fatalFailures,firstFatalFailure,replacement};
}
if(typeof document==='undefined')console.log(JSON.stringify(nativeAudit()));
else document.body.textContent=JSON.stringify(nativeAudit());
