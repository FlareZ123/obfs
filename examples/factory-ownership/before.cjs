function makePrivate() {
  return {secretField: 17, otherField: [3, 5]};
}
const owner = makePrivate();
const alias = owner;
module.exports = alias.secretField + alias.otherField[1];
