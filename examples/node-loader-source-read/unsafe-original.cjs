const io=module.constructor._load("node:fs");
const source=io.readFileSync(__filename,"utf8");
const state={secretField:31};
const key=["secret","Field"].join("");
console.log(state.secretField,source.includes(key));
