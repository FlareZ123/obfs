import {evaluate} from './app.mjs';
globalThis.window={
  externalValue(value){
    let x=(value^0xa5a5a5a5)>>>0;
    x=Math.imul(x^(x>>>16),0x45d9f3b)>>>0;
    return (x^(x>>>16))>>>0;
  }
};
const cases=JSON.parse(process.argv[2]||'[[1,1000]]');
process.stdout.write(JSON.stringify(cases.map(([seed,count])=>evaluate(seed,count)))+'\n');
