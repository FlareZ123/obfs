const root={secretField:7,otherField:5};
const factor=value=>value.secretField;
const bits=function(value){return value["otherField"];};
module.exports=[factor(root),bits(root),root.otherField];
