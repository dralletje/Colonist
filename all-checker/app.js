let { parse } = require('babylon');

// UTILS
precondition = (condition, message = `Unmet precondition`) => {
  if (!condition) {
    throw new Error(message);
  }
}

const by_type = (x) => x.type;
const match_by = /*:<TIn, TOut>*/(value/*: TIn*/, selector/*: (value: TIn) => string*/, matchers/*: { [key: string]: (value: TIn) => TOut }*/)/*: TOut*/ => {
  const key = selector(value);
  const handler = matchers[key];
  if (handler) {
    return handler(value);
  } else if (matchers.default) {
    return matchers.default(value);
  } else {
    throw new Error(`No handler set for '${key}'`);
  }
}

const match_one = /*:<T>*/(value/*: string*/, matchers/*: { [key: string]: () => T }*/)/*: T*/ => {
  return match_by(undefined, () => value, matchers);
}

// CODE
// class Input

let expression_to_operations = (expression_node) => {
  return match_one(expression_node.type, {
    ArrowFunctionExpression: () => {
      precondition(expression_node.async === false);
      precondition(expression_node.generator === false);
      precondition(expression_node.body.type === 'BlockStatement');

      let sub_operations = block_to_operations(expression_node.body.body);
    },
  })
}

let block_to_operations = (nodes) => {
  let state = {};

  for (let node of nodes) {
    match_one(node.type, {
      'VariableDeclaration': () => {
        // node.kind === 'let' | 'const' | 'var'
        for (let declaration of node.declarations) {
          precondition(declaration.type === 'VariableDeclarator');
          let sub_operations = expression_to_operations(declaration.init);
        }
      },
      IfStatement: () => {
        // Return conditional
        return { type: 'conditional' }
      },
      ReturnStatement: () => {
        
      },
    })
  }

  return state;
}

// USAGE
let code = `
  let sqrt = (x) => {
    if (x < 0) {
      throw new Error("Can't root a negative numers")
    }
    return Math.sqrt(x);
  }
  sqrt(10);
`;

let ast = parse(code);

console.log(`ast:`, block_to_operations(ast.program.body));
