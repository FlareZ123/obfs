const root={secretField:7,otherField:5};
const factor=first=>first.secretField;
const bits=function(second){return second["otherField"];};
module.exports=[factor(root),bits(root),root.otherField];
