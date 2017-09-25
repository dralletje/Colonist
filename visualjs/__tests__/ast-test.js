test('generates flow graph', () => {
  const graphify = require('../graphify.js')

  let code = `
  fnName(objectName.methodName()).propName
  `

  let expectedState = {
    nextId: 9,
    nodes: [
      { id: 1, type: 'scopelookup', name: 'fnName', constant: false },
      { id: 2, type: 'scopelookup', name: 'objectName', constant: false },
      { id: 3, type: 'literal', value: `'methodName'`},
      { id: 4, type: 'property', refs: [2, 3] },
      { id: 5, type: 'call', refs: [4] },
      { id: 6, type: 'call', refs: [1, 5] },
      { id: 7, type: 'literal', value: `'propName'` },
      { id: 8, type: 'property', refs: [6, 7] },
    ],
  };

  expect(graphify(code)).toEqual(expectedState);
})
