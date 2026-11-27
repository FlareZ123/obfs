'use strict';
const cases={
  'constructor number':()=>new TextDecoder('utf-8',0).decode(Uint8Array.of(65)),
  'constructor string':()=>new TextDecoder('utf-8','x').decode(Uint8Array.of(65)),
  'constructor boolean':()=>new TextDecoder('utf-8',true).decode(Uint8Array.of(65)),
  'constructor null':()=>new TextDecoder('utf-8',null).decode(Uint8Array.of(65)),
  'decode number':()=>new TextDecoder().decode(Uint8Array.of(65),0),
  'decode string':()=>new TextDecoder().decode(Uint8Array.of(65),'x'),
  'decode boolean':()=>new TextDecoder().decode(Uint8Array.of(65),true),
  'decode null':()=>new TextDecoder().decode(Uint8Array.of(65),null),
  'constructor number getter':()=>new TextDecoder('utf-8',0).encoding,
  'ordinary ASCII':()=>new TextDecoder().decode(Uint8Array.of(65)),
  'fatal ASCII':()=>new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.of(65)),
  'ordinary invalid byte':()=>new TextDecoder().decode(Uint8Array.of(128)),
  'inherited fatal':()=>new TextDecoder('utf-8',{__proto__:{fatal:true}}).decode(Uint8Array.of(128)),
  'own fatal true':()=>new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.of(128)),
  'ordinary replacement':()=>new TextDecoder('utf-8',{fatal:false}).decode(Uint8Array.of(128)),
  'null options invalid byte':()=>new TextDecoder('utf-8',null).decode(Uint8Array.of(128),null),
  'stream true':()=>{const d=new TextDecoder();return d.decode(Uint8Array.of(226),{stream:true})+d.decode(Uint8Array.of(130,172));},
  'computed fatal false':()=>new TextDecoder('utf-8',{['fatal']:false}).decode(Uint8Array.of(128)),
  'shadowed static byte constructor':()=>{const Uint8Array={of(){return 'bad';}};return new TextDecoder().decode(Uint8Array.of(65));},
  'shadowed new byte constructor':()=>{const Uint8Array=class {};return new TextDecoder().decode(new Uint8Array([65]));},
  'shadowed static ASCII proof':()=>{const Real=Uint8Array;{const Uint8Array={of(){return Real.of(128);}};return new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.of(65));}},
  'ordinary typed bytes':()=>new TextDecoder().decode(new Uint8Array([65])),
  'shadow in disjoint scope':()=>{function unused(){const Uint8Array={of(){return 'bad';}};return Uint8Array.of(65);}return new TextDecoder().decode(Uint8Array.of(65));}
};
const outcomes=Object.fromEntries(Object.entries(cases).map(([name,fn])=>{
  try{return [name,{ok:true,value:fn()}];}
  catch(error){return [name,{ok:false,name:error.name,message:error.message}];}
}));
if(typeof document==='undefined')console.log(JSON.stringify(outcomes,null,2));
else document.body.textContent=JSON.stringify(outcomes);
