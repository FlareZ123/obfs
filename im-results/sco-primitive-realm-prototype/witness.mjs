import vm from 'node:vm';

const client = vm.createContext({});
const server = vm.createContext({});
const source = "''.toString().length";

// Model an attacker-controlled browser realm with a patched String prototype.
// The server realm keeps its independent, unmodified intrinsics.
vm.runInContext(
  "String.prototype.toString = function () { return 'tamper!'; }",
  client
);

const originalClient = vm.runInContext(source, client);
const transformedClient = vm.runInContext(source, client);
const relocatedServer = vm.runInContext(source, server);

console.log(JSON.stringify([originalClient, transformedClient, relocatedServer]));
