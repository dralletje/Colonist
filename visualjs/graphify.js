// @flow

let babylon = require("flow-parser");
let generate = require('babel-generator').default;

type Exact<T> = T & $Shape<T>;

type Scope =
  // `let` or `const` in javascript
  | 'block'
  // `var`, bubbles up from block scopes
  | 'function'
  // `function`, declaration AND assigment bubble up
  | 'hoist-function'

type Node =
  // ** Variables **
  | {| id: number, type: 'declaration', name: string, constant: boolean, scope: Scope |}
  // The actual declaration, only created with let, const, var and function
  // TODO Make a different type for var's, as those have to 'escape' blocks?
  | {| id: number, type: 'scopelookup', name: string |}
  // When a variable is used (for the first time) in a scope that doesn't have it,
  // it will create this. Then when the parent scope parses the state it gets from the
  // child scope, it will replace those with:
  | {| id: number, type: 'scopereference', ref: [number] |}
  // Which is a special (and the only) type that is allowed to go cross scope/block barriers.
  // Yes, we will have a lot of those, but I hope it is worth it hahaha
  // If the declaration for a variable is not found in this scope again, it will reference this scopereference
  // to a (possible newly created) scopelookup in turn, hoping to have that scopelookup be replaced
  // by his parent scope, and so on. Global variables will stay 'scopelookup' till the very end.
  | {| id: number, type: 'assignment', ref: [number, number] |} // refs: [variable, initValue]
  // Assignment happens when declaring, but can happen any time after that as well.
  // Maybe the declaration should have an initial value, not an assigment following it, but that felt the most natural now.

  // ** Literals**
  | {| id: number, type: 'literal', value: string |}
  // Literal values like number, strings, null(?), NaN(?), etc(?)
  | {| id: number, type: 'undefined' |}
  // I made a seperate type for 'undefined', not sure if this is smart

  | {| id: number, type: 'property', refs: [number, number] |} // refs: [object, property]
  // Property accessing: right now turns hardcoded .xxx into ['xxx'] with strings
  | {| id: number, type: 'call', refs: number[] |} // refs: [function, ...args]

  | {| id: number, type: 'binary', operator: string, refs: [number, number] |} // refs: [leftArg, rightArg]
  | {| id: number, type: 'unary', operator: string, refs: [number] |} // refs: [onlyArgLol]
  // TODO Treat binary or unary as a (special kind) of call? (Thus creating a scopelookup that goes to global?)
  | {| id: number, type: 'unknown', code: string |}
  // This is just a placeholder type for when I haven't implemented something yet (see unspecifiedStatement)

type State = {
  isOutdated?: boolean,
  nextId: number,
  nodes: Node[],
}

type ASTNode = any;

let unspecifiedStatement = (statement: ASTNode, state: State): { state: State, resultId: number } => {
  console.log('statement:', statement);
  return insertNodeIntoState(state, {
    id: 0,
    type: 'unknown',
    code: generate(statement).code,
  });
};

let insertNodeIntoState = (state: State, node: Node): { state: State, resultId: number } => {
  let nextNode = (Object.assign({}, node, { id: state.nextId }): any);
  console.log('Inserting', nextNode);

  // Small debug piece to see if I'm reusing state somewhere
  if (state.isOutdated) {
    console.warn('State being reused, sure?');
    console.trace();
  }
  state.isOutdated = true;
  // End

  return {
    state: {
      nextId: state.nextId + 1,
      nodes: [
        ...state.nodes,
        nextNode,
      ]
    },
    resultId: state.nextId,
  }
}

let executePropertyOnState = (state: State, property: ASTNode): { state: State, resultId: number } => {
  if (property.type === 'Identifier') {
    // TODO: Decide whether or not to treat Identifiers unique, and not as string literals
    let { name } = property;
    return insertNodeIntoState(state, {
      id: 0,
      type: 'literal',
      value: `'${name}'`,
    })
  }
  else if (property.type === 'Literal') {
    // TODO: Make this handle different types than Literal (using executeExpressionOnState)
    return insertNodeIntoState(state, {
      id: 0,
      type: 'literal',
      value: property.raw,
    })
  }
  else {
    return unspecifiedStatement(property, state);
  }
}

// TODO: Variables and scoping
let getDeclarationIdByName = (state: State, name: string): { state: State, resultId: number } => {
  let declaration = state.nodes.find(node => (node.type === 'declaration' || node.type === 'scopelookup') && node.name === name);
  // Look for a declaration or pre-existing scopelookup in the current scope/state.

  if (declaration) {
    return { state, resultId: declaration.id };
    // When present, return the id of this declaration/scopelookup

  } else {
    return insertNodeIntoState(state, {
      id: 0,
      type: 'scopelookup',
      name: name,
    });
    // If not present, create a scopelookup and return the id of that.
  }
}

// Create a subscope/blockscope (and merge it in?)
// Neccesary because this keeps the nextId of the previous state, which is easy to forget.
let createSubScopeState = (state: State /*, identifier that creates the scope? */): State => {
  return {
    nextId: state.nextId,
    nodes: [],
  };
}

// Merges a subscope in that is created with createSubScopeState
// - Makes sure the new state has the right nextId
// - Looks for scopelookups and replaces then with scopereferences
// - Creates scopelookups in turn for every scopelookup that is not resolved
// - TODO Figure out how var works here, as it should replace scopelookups in this scope itself (hoisting?!)
let mergeSubScopeIntoState = (state: State, subscope: State): State => {
  throw new Error('Implement mergeSubScopeIntoState')
}


let executeExpressionOnState = (state: State, expression: ?ASTNode): { state: State, resultId: number } => {
  // Null, for some BIZAR reason THANKS AST
  if (!expression) {
    return insertNodeIntoState(state, {
      id: 0,
      type: 'undefined',
    });
  }
  else if (expression.type === 'MemberExpression') {
    let { computed, property, object } = expression;
    let { state: stateAfterObjectExecution, resultId: objectId } = executeExpressionOnState(state, object);
    let { state: stateAfterPropExecution, resultId: propId } = executePropertyOnState(stateAfterObjectExecution, property)

    return insertNodeIntoState(stateAfterPropExecution, {
      id: 0,
      type: 'property',
      refs: [objectId, propId],
    })
  }
  else if (expression.type === 'CallExpression') {
    let {
      state: nextState,
      resultIds: [subjectId, ...argumentIds],
    } = executeMultipleExpressionsOnState(state, [
      expression.callee,
      ...expression.arguments,
    ]);

    return insertNodeIntoState(nextState, {
      id: 0,
      type: 'call',
      refs: [subjectId, ...argumentIds],
    });
  }
  else if (expression.type === 'Identifier') {
    return getDeclarationIdByName(state, expression.name);
    // Looks for a declaration or scopelookup (and creates one if it does not exist)
    // Then just returns the id of the declaration/scopelookup
    // TODO Put getDeclarationIdByName just in here... if we don't need it anywhere else
  }
  else if (expression.type === 'BinaryExpression') {
    let {
      state: nextState,
      resultIds: [leftId, rightId],
    } = executeMultipleExpressionsOnState(state, [expression.left, expression.right]);

    return insertNodeIntoState(nextState, {
      id: 0,
      type: 'binary',
      operator: expression.operator,
      refs: [leftId, rightId],
    });
  }
  else if (expression.type === 'NumericLiteral' || expression.type === 'StringLiteral') {
    return insertNodeIntoState(state, {
      id: 0,
      type: 'literal',
      value: expression.raw || expression.extra.raw,
    });
  }
  else {
    return unspecifiedStatement(expression, state);
  }

}

let executeMultipleExpressionsOnState = (initialState: State, expressions: ASTNode[]): { state: State, resultIds: number[] } => {
  return expressions.reduce(({ state, resultIds }, expression) => {
    let { state: nextState, resultId } = executeExpressionOnState(state, expression);
    return {
      state: nextState,
      resultIds: [ ...resultIds, resultId ],
    };
  }, { state: initialState, resultIds: [] });
}

let addDeclarationToState = (state: State, { name, constant, valueId }: { name: string, constant: boolean, valueId: number }) => {
  // TODO: Handle scoping + difference let and var

  let { state: stateWithDeclaration, resultId: declarationId } = insertNodeIntoState(state, {
    id: 0,
    type: 'declaration',
    name: name,
    constant: constant,
    scope: 'block', // TODO
  });

  return insertNodeIntoState(stateWithDeclaration, {
    id: 0,
    type: 'assignment',
    ref: [declarationId, valueId],
  }).state;
}

let graphiphy = (code: string): State => {
  let ast = babylon.parse(code, {
    // parse in strict mode and allow module declarations
    sourceType: "module",

    plugins: [
      // enable jsx and flow syntax
      "jsx",
      "flow"
    ]
  });

  let body = ast.body;

  let initialState = {
    nextId: 1,
    nodes: [],
  };

  return (body: ASTNode[]).reduce((state: State, statement): State => {
    if (statement.type === 'ExpressionStatement') {
      let { state: nextState, resultId: lastExpressionId } = executeExpressionOnState(state, statement.expression);
      return nextState;
    }

    else if (statement.type === 'VariableDeclaration') {
      return statement.declarations.reduce((prevState, declaration): State => {
        let { state: stateWithInit, resultId: initId } = executeExpressionOnState(prevState, declaration.init)
        return addDeclarationToState(stateWithInit, {
          name: declaration.id.name,
          constant: statement.kind === 'const',
          valueId: initId,
        })
      }, state);
    }

    // NOTE Just completely disallow function declarations in block-scopes
    // NOTE Also only hoist var to the current (block)scope to avoid code :P
    else if (statement.type === 'FunctionDeclaration') {
      console.log('statement:', statement)
      let { state: stateWithInit, resultId: initId } = executeExpressionOnState(state, statement.init)
      let stateWithDeclaration = addDeclarationToState(stateWithInit, {
        name: 'Heya',
        constant: statement.kind === 'const',
        valueId: initId,
      });
      return stateWithDeclaration;
    }
    else {
      return unspecifiedStatement(statement, state).state;
    }
  }, initialState);
}

// NOTE
// var: Go through all nodes in the current scope, looking for a scopelookup, and replace that with this declaration (take over id)
// let:

module.exports = graphiphy;
