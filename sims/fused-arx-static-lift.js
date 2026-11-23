'use strict';

/**
 * Independent source-only attacker for the fixed public fused-ARX Wasm pilot.
 * Reads the binary code section directly and interprets the recovered i32
 * instructions as JavaScript. No WebAssembly API, compiler, or nativeMix source
 * is used by this module. This is an intentionally small documented subset,
 * not a complete standards-compliant WebAssembly engine.
 */

/** @typedef {{op:number,arg:number,end:number}} Instruction */

/**
 * Decode a public WebAssembly binary into a standalone JavaScript executor.
 * The original pilot uses six i32 inputs and two local registers. The
 * frozen stateful batch adds a seventh input and seven local registers.
 * Both publish four i32 outputs in linear memory at offsets 0 through 15.
 *
 * @param {Uint8Array} bytes
 * @returns {{run:(state:readonly number[],units:Uint16Array,serialStart?:number)=>number[],instructions:readonly Instruction[]}}
 */
function staticLiftFusedArx(bytes) {
  if(!(bytes instanceof Uint8Array) || bytes.length<8 ||
    [0,97,115,109,1,0,0,0].some((byte,index)=>bytes[index]!==byte))
    throw new Error('Expected a WebAssembly version 1 binary');

  let cursor=8;
  /** @returns {number} */
  function uleb() {
    let value=0;
    for(let shift=0;shift<=28;shift+=7) {
      if(cursor>=bytes.length)throw new Error('Truncated uleb');
      const byte=bytes[cursor++];
      value+=(byte&127)*2**shift;
      if(!(byte&128))return value;
    }
    throw new Error('Oversized uleb');
  }
  /** @returns {number} */
  function sleb32() {
    let value=0;
    for(let shift=0;shift<=28;shift+=7) {
      if(cursor>=bytes.length)throw new Error('Truncated signed leb');
      const byte=bytes[cursor++];
      value|=(byte&127)<<shift;
      if(!(byte&128)){
        if(shift<25 && (byte&64))value|=(-1)<<(shift+7);
        return value|0;
      }
    }
    throw new Error('Oversized signed leb');
  }

  /** @type {Instruction[]} */
  const instructions=[];
  let localsCount=-1;
  for(;cursor<bytes.length;) {
    const section=bytes[cursor++];
    const size=uleb();
    const sectionEnd=cursor+size;
    if(sectionEnd>bytes.length)throw new Error('Section exceeds binary');
    if(section!==10){cursor=sectionEnd;continue;}
    if(uleb()!==1)throw new Error('Expected one pilot function');
    const bodySize=uleb(),bodyEnd=cursor+bodySize;
    if(bodyEnd!==sectionEnd)throw new Error('Unexpected code section shape');
    const declarationCount=uleb();
    localsCount=0;
    for(let i=0;i<declarationCount;i++){
      localsCount+=uleb();
      if(bytes[cursor++]!==0x7f)throw new Error('Expected i32 locals');
    }
    /** @type {number[]} */
    const control=[];
    let functionEnd=false;
    while(cursor<bodyEnd){
      const op=bytes[cursor++];
      /** @type {Instruction} */
      const instruction={op,arg:0,end:-1};
      const index=instructions.length;
      if(op===0x02||op===0x03){
        if(bytes[cursor++]!==0x40)throw new Error('Unsupported block signature');
        control.push(index);
      }else if(op===0x0b){
        if(control.length)instructions[/** @type {number} */(control.pop())].end=index;
        else functionEnd=true;
      }else if([0x0c,0x0d,0x20,0x21].includes(op)){
        instruction.arg=uleb();
      }else if(op===0x41){
        instruction.arg=sleb32();
      }else if(op===0x2f||op===0x36){
        uleb(); // public alignment hint
        instruction.arg=uleb(); // memory offset
      }else if(![0x4f,0x6a,0x6c,0x72,0x73,0x74,0x76,0x77].includes(op)){
        throw new Error('Unsupported pilot opcode '+op.toString(16));
      }
      instructions.push(instruction);
      if(functionEnd&&cursor!==bodyEnd)throw new Error('Trailing function instructions');
    }
    if(control.length||!functionEnd||cursor!==bodyEnd)
      throw new Error('Unbalanced WebAssembly function');
  }
  if(![2,7].includes(localsCount)||instructions.length===0)
    throw new Error('Expected fixed pilot or seven-local stateful batch');

  let view=new DataView(new ArrayBuffer(65536));
  /**
   * Replay the published memory ABI with only JavaScript i32 operations.
   * @param {readonly number[]} state
   * @param {Uint16Array} units
   * @param {number} [serialStart]
   * @returns {number[]}
   */
  function run(state,units,serialStart=0) {
    if(state.length!==4)throw new Error('Four seed words required');
    const required=16+units.length*2;
    if(required>view.byteLength)
      view=new DataView(new ArrayBuffer(Math.ceil(required/65536)*65536));
    for(let index=0;index<units.length;index++)
      view.setUint16(16+index*2,units[index],true);
    const locals=localsCount===2
      ?[state[0]|0,state[1]|0,state[2]|0,state[3]|0,16,units.length,0,0]
      :[state[0]|0,state[1]|0,state[2]|0,state[3]|0,16,units.length,serialStart|0,
        0,0,0,0,0,0,0];
    /** @type {number[]} */
    const stack=[];
    /** @type {{kind:number,start:number,end:number}[]} */
    const frames=[];
    /** @param {number} depth @returns {number} */
    function branch(depth){
      const index=frames.length-1-depth;
      if(index<0)throw new Error('Invalid branch label');
      const frame=frames[index];
      frames.length=frame.kind===0x03?index+1:index;
      return frame.kind===0x03?frame.start:frame.end+1;
    }
    for(let pc=0;pc<instructions.length;){
      const instruction=instructions[pc];
      const {op,arg}=instruction;
      switch(op){
        case 0x02:case 0x03:
          frames.push({kind:op,start:pc+1,end:instruction.end});
          pc++;break;
        case 0x0b:
          if(frames.length)frames.pop();
          pc++;break;
        case 0x0c:pc=branch(arg);break;
        case 0x0d:{
          const condition=/** @type {number} */(stack.pop());
          pc=condition?branch(arg):pc+1;break;
        }
        case 0x20:stack.push(locals[arg]);pc++;break;
        case 0x21:locals[arg]=/** @type {number} */(stack.pop());pc++;break;
        case 0x41:stack.push(arg);pc++;break;
        case 0x2f:{
          const pointer=/** @type {number} */(stack.pop());
          stack.push(view.getUint16((pointer>>>0)+arg,true));pc++;break;
        }
        case 0x36:{
          const value=/** @type {number} */(stack.pop());
          const pointer=/** @type {number} */(stack.pop());
          view.setInt32((pointer>>>0)+arg,value,true);pc++;break;
        }
        default:{
          const b=/** @type {number} */(stack.pop());
          const a=/** @type {number} */(stack.pop());
          let value;
          switch(op){
            case 0x4f:value=(a>>>0)>=(b>>>0)?1:0;break;
            case 0x6a:value=(a+b)|0;break;
            case 0x6c:value=Math.imul(a,b);break;
            case 0x72:value=a|b;break;
            case 0x73:value=a^b;break;
            case 0x74:value=a<<(b&31);break;
            case 0x76:value=a>>>(b&31);break;
            case 0x77:value=(a<<(b&31))|(a>>>((32-(b&31))&31));break;
            default:throw new Error('Unhandled opcode');
          }
          stack.push(value);pc++;break;
        }
      }
    }
    return [0,4,8,12].map(offset=>view.getInt32(offset,true));
  }
  return {run,instructions};
}

module.exports={staticLiftFusedArx};
