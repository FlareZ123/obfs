(()=>{
'use strict';
function bytesFor(cp){
 if(cp<=127)return [cp];if(cp<=2047)return [192|(cp>>6),128|(cp&63)];if(cp<=65535)return [224|(cp>>12),128|((cp>>6)&63),128|(cp&63)];return [240|(cp>>18),128|((cp>>12)&63),128|((cp>>6)&63),128|(cp&63)];
}
function oracle(ignoreBOM){
 let cp=0,need=0,seen=0,lo=128,hi=191,bomSeen=false;
 function reset(){cp=0;need=0;seen=0;lo=128;hi=191;}
 return function decode(bytes,stream){
  let out='';function emit(value){if(!bomSeen){bomSeen=true;if(value===65279&&!ignoreBOM)return;}out+=String.fromCodePoint(value);}
  for(let i=0;i<bytes.length;i++){
   const b=bytes[i];
   if(need===0){if(b<=127){emit(b);continue;}if(b>=194&&b<=223){cp=b&31;need=1;continue;}if(b>=224&&b<=239){cp=b&15;need=2;if(b===224)lo=160;if(b===237)hi=159;continue;}if(b>=240&&b<=244){cp=b&7;need=3;if(b===240)lo=144;if(b===244)hi=143;continue;}emit(65533);continue;}
   if(b<lo||b>hi){reset();emit(65533);i--;continue;}lo=128;hi=191;cp=(cp<<6)|(b&63);seen++;if(seen===need){emit(cp);reset();}
  }
  if(!stream){if(need)emit(65533);reset();bomSeen=false;}return out;
 };
}
const results={scalarCases:0,scalarCalls:0,randomCases:0,randomCalls:0,mismatches:0,firstMismatches:[]};
function compare(expected,actual,context){if(expected===actual)return;results.mismatches++;if(results.firstMismatches.length<10)results.firstMismatches.push({expected,actual,context});}
for(const ignoreBOM of [false,true]){
 const d=new TextDecoder('utf-8',{ignoreBOM});
 for(let cp=0;cp<=0x10ffff;cp++){
  if(cp>=0xd800&&cp<=0xdfff)continue;
  const bytes=bytesFor(cp),expected=(cp===65279&&!ignoreBOM)?'':String.fromCodePoint(cp);
  for(let split=0;split<=bytes.length;split++){
   const a=d.decode(Uint8Array.from(bytes.slice(0,split)),{stream:true}),b=d.decode(Uint8Array.from(bytes.slice(split)));
   results.scalarCases++;results.scalarCalls+=2;compare(split===bytes.length?expected:'',a,{cp,split,ignoreBOM,part:0});compare(split===bytes.length?'':expected,b,{cp,split,ignoreBOM,part:1});
  }
 }
 let x=0x6a09e667;function rand(){x^=x<<13;x^=x>>>17;x^=x<<5;return x>>>0;}
 const independent=oracle(ignoreBOM);
 for(let seq=0;seq<100000;seq++){
  const bytes=Array.from({length:rand()%25},()=>rand()&255),chunks=[];let offset=0;
  while(offset<bytes.length){const size=1+rand()%5;chunks.push({bytes:bytes.slice(offset,offset+size),stream:Boolean(rand()&1)});offset+=size;}
  if(!chunks.length||rand()%3===0)chunks.push({bytes:[],stream:true,omitted:true});chunks.push({bytes:[],stream:false,omitted:Boolean(rand()&1)});
  for(let i=0;i<chunks.length;i++){
   const {bytes,stream,omitted}=chunks[i];const expected=independent(bytes,stream),input=omitted?undefined:Uint8Array.from(bytes),actual=stream?d.decode(input,{stream:true}):d.decode(input);results.randomCalls++;compare(expected,actual,{seq,i,bytes,stream,omitted,ignoreBOM});
  }
  results.randomCases++;
 }
}
return results;
})()
