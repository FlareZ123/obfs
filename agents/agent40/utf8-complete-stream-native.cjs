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
function completeUtf8(bytes){
 for(let i=0;i<bytes.length;){
  const a=bytes[i++];if(a<=127)continue;
  let need=0,lo=128,hi=191;
  if(a>=194&&a<=223)need=1;
  else if(a>=224&&a<=239){need=2;if(a===224)lo=160;if(a===237)hi=159;}
  else if(a>=240&&a<=244){need=3;if(a===240)lo=144;if(a===244)hi=143;}
  else return false;
  if(i+need>bytes.length)return false;
  for(let j=0;j<need;j++){const b=bytes[i++];if(b<(j===0?lo:128)||b>(j===0?hi:191))return false;}
 }
 return true;
}
const results={randomCases:0,randomCalls:0,streamCalls:0,mismatches:0,firstMismatches:[]};
function compare(expected,actual,context){if(expected===actual)return;results.mismatches++;if(results.firstMismatches.length<10)results.firstMismatches.push({expected,actual,context});}
for(const ignoreBOM of [false,true]){
 const d=new TextDecoder('utf-8',{ignoreBOM});
 let x=0x6a09e667;function rand(){x^=x<<13;x^=x>>>17;x^=x<<5;return x>>>0;}
 const independent=oracle(ignoreBOM);
 for(let seq=0;seq<250000;seq++){
  const chunks=[];
  const count=1+rand()%8;
  for(let c=0;c<count;c++){
   const bytes=[];const length=rand()%10;
   if(rand()&1){for(let n=0;n<length;n++){let cp=rand()%0x110000;if(cp>=0xd800&&cp<=0xdfff)cp=0xfeff;bytes.push(...bytesFor(cp));}}
   else for(let n=0;n<length;n++)bytes.push(rand()&255);
   if(rand()%10===0)bytes.unshift(239,187,191);
   chunks.push({bytes,stream:Boolean(rand()&1)&&completeUtf8(bytes)});
  }
  chunks.push({bytes:[],stream:false,omitted:Boolean(rand()&1)});
  for(let i=0;i<chunks.length;i++){
   const {bytes,stream,omitted}=chunks[i];const expected=independent(bytes,stream),input=omitted?undefined:Uint8Array.from(bytes),actual=stream?d.decode(input,{stream:true}):d.decode(input);results.randomCalls++;if(stream)results.streamCalls++;compare(expected,actual,{seq,i,bytes,stream,omitted,ignoreBOM});
  }
  results.randomCases++;
 }
}
return results;
})()
