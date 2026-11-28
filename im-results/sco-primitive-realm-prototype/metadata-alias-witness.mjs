import vm from 'node:vm';

const client = vm.createContext({});
const server = vm.createContext({});
const source = "(()=>{const fn=()=>1;const name=fn.name;return name.toString().length;})()";

vm.runInContext(
  "String.prototype.toString = function () { return 'browser'; }",
  client
);

const originalClient = vm.runInContext(source, client);
const transformedClient = vm.runInContext(source, client);
const relocatedServer = vm.runInContext(source, server);

console.log(JSON.stringify([originalClient, transformedClient, relocatedServer]));
