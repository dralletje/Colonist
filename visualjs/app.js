const graphify = require('./graphify.js')

let code = `
function fibonacci(num) {
  let a = 1;
  let b = 0;
  let temp;

  while (num >= 0) {
    temp = a;
    a = a + b;
    b = temp;
    num--;
  }

  return b;
}
`

let resultState = graphify(code);

console.log('state:', JSON.stringify(resultState, undefined, 2));
