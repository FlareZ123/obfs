'use strict';
import {digest} from './math.mjs';

/**
 * @param {{emit:(value:{kind:string,value:number,serial:number})=>void}} host
 * @param {number} secret
 * @returns {{apply:(input:{kind:unknown,payload:unknown})=>unknown,snapshot:()=>unknown}}
 */
export function createSession(host,secret){
  const state={serial:0,last:secret|0,label:'live'};
  return {
    apply(input){
      const kind=String(input.kind),payload=String(input.payload);
      state.serial++;
      state.last=digest(state.last,kind+':'+payload);
      const result={kind,value:state.last,serial:state.serial};
      host.emit(result);
      return {result,visible:Object.keys(state),
        reflected:Reflect.get(state,'last'),
        ownsLast:Object.hasOwn(state,'last')};
    },
    snapshot(){
      return {serial:state.serial,last:state.last,
        reflected:Object.getOwnPropertyDescriptor(state,'label')?.value,
        visible:Object.keys(state)};
    }
  };
}
