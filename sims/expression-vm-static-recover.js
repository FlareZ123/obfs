'use strict';

/** @typedef {{name:string,parameter:string,expression:string,instructions:number}} RecoveredGraph */

/**
 * Read only distributed output and reconstruct its native expression graph.
 * Does not load the original source, compiler implementation or build seed.
 * Supports the exact experimental expression-VM emitter, not generic VMs.
 * @param {string} code
 * @returns {RecoveredGraph}
 */
function recoverExpressionVm(code) {
  const wrapper=/function\s+([A-Za-z_$][\w$]*)\s*\(\s*([A-Za-z_$][\w$]*)\s*\)\s*\{\s*return\s+(_egvm_[0-9a-f]+)\(\s*\2\s*\)\s*;\s*\}/u.exec(code);
  if(!wrapper)throw new TypeError('Missing emitted VM wrapper');
  const [,name,parameter,helper]=wrapper;
  const cache=new RegExp(helper+'Cache=\\[(\\d+(?:,\\d+)*)\\]','u').exec(code);
  if(!cache)throw new TypeError('Missing public bytecode');
  const bytes=cache[1].split(',').map(Number);
  const descriptor=/const opcode=\(\(tape\[pc\+\+\]\^(\d+)\)-(\d+)\)&255/u.exec(code);
  if(!descriptor)throw new TypeError('Missing public opcode encoding');
  const key=Number(descriptor[1]),rotation=Number(descriptor[2]);
  const initial=/const registers=\[(.*?)\];let pc=0/u.exec(code);
  if(!initial)throw new TypeError('Missing public registers');
  const registers=initial[1].split(',').map(part=>{
    if(part==='input')return parameter;
    if(part==='null')return null;
    const literal=/^\((\d+)\^(\d+)\)$/u.exec(part);
    if(!literal)throw new TypeError('Unexpected register initializer');
    return String(Number(literal[1])^Number(literal[2]));
  });
  /** @type {Map<number,string>} */
  const opcodes=new Map();
  const cases=/case\s+(\d+):registers\[dst\]=registers\[left\](>>>|>>|<<|\+|-|\*|\/|%|\^|&|\|)registers\[right\];break;/gu;
  for(const match of code.matchAll(cases))opcodes.set(Number(match[1]),match[2]);
  if(opcodes.size<2)throw new TypeError('Missing public operator mapping');
  let pc=0,instructions=0;
  for(;;) {
    if(pc>=bytes.length)throw new TypeError('Missing VM termination');
    const opcode=((bytes[pc++]^key)-rotation)&255;
    if(opcode===255) {
      const result=bytes[pc++]^key;
      if(pc!==bytes.length||typeof registers[result]!=='string')throw new TypeError('Invalid VM result register');
      return {name,parameter,expression:registers[result],instructions};
    }
    if(pc+3>bytes.length)throw new TypeError('Truncated public instruction');
    const dest=bytes[pc++]^key,left=bytes[pc++]^key,right=bytes[pc++]^key;
    const operator=opcodes.get(opcode);
    if(!operator||typeof registers[left]!=='string'||typeof registers[right]!=='string'||
        dest>=registers.length)throw new TypeError('Invalid VM data-flow');
    registers[dest]='('+registers[left]+operator+registers[right]+')';
    instructions++;
  }
}

module.exports={recoverExpressionVm};
