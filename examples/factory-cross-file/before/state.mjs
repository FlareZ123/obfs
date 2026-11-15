function makePrivate() {
  return {secretField: 17, otherField: 5};
}
export const shared = makePrivate();
