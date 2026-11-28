(()=>{
const cases=[[[240],[203,184,87,5]],[[240],[203,184,87]],[[240],[203,184]],[[242],[209,141,161]],[[242],[209,141]],[[242],[209,141,65]],[[242],[216,151,244,172,119]],[[241],[203,138,59,45,82]],[[223],[243,217,153,59]],[[211],[244,217,179,38]]];
const out=[];
for(const chunks of cases){for(const secondStream of [false,true]){const d=new TextDecoder();out.push({chunks,secondStream,result:[d.decode(Uint8Array.from(chunks[0]),{stream:true}),d.decode(Uint8Array.from(chunks[1]),{stream:secondStream}),d.decode()]})}}
return out;
})()
