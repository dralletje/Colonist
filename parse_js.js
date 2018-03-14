// @flow

import { parse } from 'babylon';
import { flatten, uniq } from 'lodash';

const precondition = (condition: boolean, message: string = `Unmet precondition`) => {
  if (!condition) {
    throw new Error(message);
  }
}

// In the spirit of naming things after what they really are, not after
// what they share in common
const TODO = (condition: boolean, message: string = `TODO`) => {
  if (!condition) {
    throw new Error(`TODO ${message}`);
  }
}

const better_to_JSON = function() {
  return {
    type: this.constructor.name,
    ...this,
  };
}

const by_type = (x) => x.type;
const match_by = <TIn, TOut>(value: TIn, selector: (value: TIn) => string, matchers: { [key: string]: (value: TIn) => TOut }): TOut => {
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

const match_one = <T>(value: string, matchers: { [key: string]: () => T }): T => {
  return match_by(undefined, () => value, matchers);
}

const get_identifier_name = (identifier_ast) => {
  precondition(identifier_ast.type === 'Identifier');
  return identifier_ast.name;
}

/*
This takes argument or assignment and change it into operations too.
Reference to "The thing being assigned" is AssignmentReferenceExpression.
See the huge comment I made there for more information about my thoughts :P
*/
const pattern_to_operations = ({ pattern_ast, scope }) => {
  precondition(pattern_ast != null);

  return match_one(pattern_ast.type, {
    Identifier: () => {
      return new MutationOperation({
        object: new ReferenceOperation(),
        property: get_identifier_name(pattern_ast),
        value: new AssignmentReferenceOperation(),
      });
    },
    MemberExpression: () => {
      precondition(pattern_ast.property.type === 'Identifier', `Nested member expressions TODO`);
      precondition(pattern_ast.property.type === 'Identifier', `Nested member expressions TODO`);

      return new MutationOperation({
        object: new PropertyOperation({
          object: ScopeReferenceOperation({ name: 'TODO' }),
          property: new LiteralOperation({
            value: get_identifier_name(expression_ast.property)
          }),
        }),
        property: get_identifier_name(pattern_ast.property),
        value: new AssignmentReferenceOperation(),
      });
    },
    // TODO ObjectPattern (destructuring)
    // TODO AssignmentPattern (default values)
  });
};


const statement_to_operations = ({ statement_ast, scope }): Operation => {
  return match_one(statement_ast.type, {
    VariableDeclaration: () =>
      new OperationSequence({
        operations: statement_ast.declarations.map(declarator => {
          precondition(declarator.type === 'VariableDeclarator');
          TODO(declarator.init != null, `I will fix undefined inits later`);

          return new AssignmentOperation({
            pattern: pattern_to_operations({
              scope,
              pattern_ast: declarator.id,
            }),
            source: expression_to_operations({ expression_ast: declarator.init, scope }),
          });
        }),
      }),

    BlockStatement: () =>
      new OperationSequence({
        operations: statement_ast.body.map(sub_statement =>
          statement_to_operations({ statement_ast: sub_statement, scope })
        ),
      }),

    ReturnStatement: () =>
      new ReturnOperation({
        value: expression_to_operations({
          expression_ast: statement_ast.argument, scope: scope,
        }),
      }),

    ExpressionStatement: () => {
      return expression_to_operations({
        expression_ast: statement_ast.expression,
        scope: scope,
      })
    }
  });
}

// scope is necessary
const expression_to_operations = ({ expression_ast, scope }): Operation => {
  precondition(expression_ast != null);

  return match_one(expression_ast.type, {
    BinaryExpression: () => {
      return new BinaryOperation({
        operator: expression_ast.operator,
        left: expression_to_operations({
          expression_ast: expression_ast.left,
          scope,
        }),
        right: expression_to_operations({
          expression_ast: expression_ast.right,
          scope,
        }),
      });
    },
    NumericLiteral: () => {
      return new LiteralOperation({
        value: expression_ast.value,
      });
    },
    ArrowFunctionExpression: () => {
      const function_scope = new Scope({
        binding_names: [
          // Properly, params are not allowed to be rebound in the function.
          // If it does anyway, we don't check for it or warn about it... TODO
          ...get_params_bindings({
            params: expression_ast.params
          }),
          ...get_binding_names({
            type: 'function',
            // What about when there is no block????
            body: expression_ast.body.body,
          }),
        ]
      });

      return new FunctionLiteralOperation({
        scope: function_scope,
        param_operation: new OperationSequence({
          operations: expression_ast.params.map(pattern_ast =>
            new AssignmentOperation({
              pattern: pattern_to_operations({
                pattern_ast: pattern_ast,
                scope: function_scope,
              }),
              source: new FunctionArgumentsReferenceOperation(),
            }),
          ),
        }),
        body_operation: statement_to_operations({
          statement_ast: expression_ast.body,
          scope: function_scope,
        }),
        is_generator: false,
        is_async: false,
      });
    },
    CallExpression: () => {
      return new OperationExpression({
        operation: new CallOperation(),
        args: [
          // The function
          expression_to_operations({
            expression_ast: expression_ast.callee,
            scope: scope,
          }),
          // ... the arguments
          ...expression_ast.arguments.map(x =>
            expression_to_operations({
              expression_ast: x,
              scope: scope,
            })
          ),
        ],
      })
    },
    MemberExpression: () => {
      return new PropertyOperation({
        object: expression_to_operations({
          expression_ast: expression_ast.object,
          scope: scope,
        }),
        property: new LiteralOperation({
          value: get_identifier_name(expression_ast.property)
        }),
      });
    },
    Identifier: () => {
      // NOTE This is only for identifier in "root" positions:
      // Many times identifiers are used in a way not presenting a binding
      // (eg. object.property)
      // TODO Refence objects?
      return new ReferenceOperation({
        name: get_identifier_name(expression_ast),
      });
    },
    AssignmentExpression: () => {
      console.log('expression_ast:', expression_ast);
      return new AssignmentOperation({
        pattern: pattern_to_operations({
          pattern_ast: expression_ast.left,
          scope: scope,
        }),
        source: expression_to_operations({
          expression_ast: expression_ast.right,
          scope: scope,
        }),
      });
    },
  })
}

/*
# Operation
Anything impure that happens, and because we can't infer from the
outside if a function is pure.. EVERYTHING MUST BE CONSIDERED IMPURE!!!

We can encapsulate side effects by saying:
OperationExpression {
  operation: Operation,
  args: Array<SubExpressions>,
}
where every SubExpression can, again, contain side-effects.
*/

/*
Effectively, this code now first takes the ast, and simplifies it as far
as it can go to the most concrete "computer program" it can make.
Sounds ambitious, it is. It will be my try at the above.

Then we take that "simple" description, and we pass it to the executor.
We make a "ExecutionCursor" or something, and let that traverse the description.
We start at the edges, those are the inputs, and we work them off.
We can put mock functions as globals that can "harcode" browser and javascript
functions like setTimeout, Math functions, DOM stuff.

*/

// Anything that we can know about a value
class Constraint {

}

// A reference to a mutable object (including scope)
// TODO STUFF§
class Reference {

}

class Operation {}
// $FlowFixMe
Operation.prototype.toJSON = better_to_JSON;

class MutationOperation extends Operation {
  object: Reference;
  property: string;
  value: Operation;

  constructor({ object, property, value }) {
    precondition(object instanceof Reference);
    precondition(typeof property === 'string');

    super();
    this.object = object;
    this.property = property;
    this.value = value;
  }
}

class BinaryOperation extends Operation {
  operator: string;
  left: Operation;
  right: Operation;

  constructor({ operator, left, right }) {
    super();
    precondition(typeof operator === 'string');
    this.operator = operator;
    this.left = left;
    this.right = right;
  }
}

class OperationSequence extends Operation {
  operations: Array<Operation>;
  constructor({ operations }) {
    super();
    this.operations = operations;
  }
}

class CallOperation extends Operation {}
class PropertyOperation extends Operation {
  object: Operation;
  property: Operation;
  constructor({ object, property }) {
    super();
    this.object = object;
    this.property = property;
  }
}


class ReturnOperation extends Operation {
  value: Operation;
  constructor({ value }) {
    super();
    this.value = value;
  }
}

// A set of constraints on a value
class Expression extends Operation {}
// $FlowFixMe
Expression.prototype.toJSON = better_to_JSON;

class OperationExpression extends Expression {
  operation: Operation;
  args: Array<Expression>;

  constructor({ operation, args }) {
    super();
    precondition(operation instanceof Operation);
    precondition(args.every(x => x instanceof Expression));

    this.operation = operation;
    this.args = args;
  }
}

/*
Gets the 'current value being assigned'
because in an assignment (const x = y), we have the "pattern" side "x"
Now in this case it is easy, but what about
```
const { x = operation(some_value) } = obj
```
In this case the pattern is more complex, and can actually cause operations
or side effects, so I want it to act just like other operations
But just how do we get access to `obj` in this case: it is not "named" in the pattern
at all. That is when AssignmentReferenceExpression comes in.
`{ x = operation(some_value) }` could become something like
```
AssignmentOperation {
  name: 'x',
  source: DefaultOperation {
    source: MemberExpression {
      object: AssignmentReferenceExpression {}, // obj
      property: LiteralExpression { name: 'x' },
    },
    fallback: OperationExpression {
      // ...operation(some_value)...
    },
  },
}
```
*/

/*
Or instead we use a generic "Scope" construct to capture for
when we -already artificially- create the operations for a pattern.
"Scope" would act as a do-block, or a light function.
*/

/*
function fn() {
  console.log(y);
  return 10;
}
var y = fn();

shall not work in this compiler. It would create a cyclic dependency
In node this would log "undefined", so not all valid javascript works for me.
var y will only be defined in after fn() returned.
In Operations it would look like

FN SCOPE

*/

/*
const fn = (x) => {
  return x * 10;
}

How would this code look in operations

DEFINE fn


--

Function create dependencies on the scope around it.
So do patterns (let { inner_to_set = outer_as_default } = obj; depends on outer_as_default (found also be function invocation)

EDIT

Function create scope-templates (Components what?!)
Functions in functions, are nested scope templates.
*/

// let race = (x1, x2) => {
//   return new Promise((yell) => {
//     let done_running = false;
//     x1.then(() => {
//       if (done_running === false) {
//         done_running = true;
//         yell();
//       }
//     });
//     x2.then(() => {
//       if (done_running === false) {
//         done_running = true;
//         yell();
//       }
//     });
//   });
// }

/*
race:
- scope { locals: x1, x2 }
  - <CallNative
*/

// This is needed so I can 'catch' AssignmentReferenceOperation-s inside the pattern
class AssignmentOperation extends Operation {
  pattern: Operation;
  source: Operation;
  constructor({ pattern, source }) {
    super();
    this.pattern = pattern;
    this.source = source;
  }
}
class AssignmentReferenceOperation extends Operation {}
class FunctionArgumentsReferenceOperation extends Operation {}

class ReferenceOperation extends Operation {
  name: string;

  constructor({ name }) {
    super();
    precondition(typeof name === 'string');
    this.name = name;
  }
}

class FunctionLiteralOperation extends Operation {
  param_operation: Operation;
  body_operation: Operation;
  is_generator: boolean;
  is_async: boolean;

  constructor({ param_operation, body_operation, is_generator, is_async }) {
    super();
    this.param_operation = param_operation;
    this.body_operation = body_operation;
    this.is_generator = is_generator;
    this.is_async = is_async;
  }
}

class LiteralOperation extends Operation {
  value: number | string;

  constructor({ value }) {
    super();
    precondition(typeof value === 'number' || typeof value === 'string');
    this.value = value;
  }
}

// Not sure if we have ImmutableBindings really..
// (const? But the value can still change? Does stuff work like this? We'll see)
class MutableBinding {
  name: string;
  defined: boolean;
  value: ?any;

  constructor({ name }) {
    precondition(typeof name === 'string');
    this.name = name;
    this.defined = false;
    this.value = undefined;
    // this.name = get_identifier_name(declarator_ast.id);
    // this.value = expression_to_operations(declarator_ast.init);
    // this.kind = kind;
  }
}

class Program {
  scope: Scope;

  constructor({ body }) {
    // First get every binding in the most upper scope
    this.scope = new Scope({
      binding_names: get_binding_names({
        type: 'function',
        body: ast.program.body,
      }),
    });

    //
    const operations = body.map(statement_ast =>
      statement_to_operations({
        statement_ast: statement_ast,
        scope: this.scope,
      })
    );

    console.log('operations:', JSON.stringify(operations, null, 2))
  }
}

const get_scope_from_block = () => {

}

class Scope {
  bindings: Map<string, MutableBinding>;

  constructor({ binding_names }) {
    this.bindings = new Map(binding_names.map((name) => {
      return [name, new MutableBinding({ name })];
    }));
  }
}

const get_vars_from_block = (block_ast) => {
  precondition(block_ast.type === 'BlockStatement');

  return flatten(
    block_ast.body.map(statement_ast => match_one(statement_ast.type, {
      VariableDeclaration: () => (
        // Here I only care about vars, because let/const will be picked up
        // separatly when the block is checked
        (statement_ast.kind === 'var')
        ? statement_ast.declarations.map(x => get_identifier_name(x.id))
        : []
      ),
      IfStatement: () => (
        flatten([
          statement_ast.consequent
          ? get_vars_from_block(statement_ast.consequent)
          : [],
          statement_ast.alternate
          ? get_vars_from_block(statement_ast.alternate)
          : [],
        ])
      ),
    }))
  )
}

const get_params_bindings = ({ params }) => {
  const bindings =
    uniq(flatten(
      params
      .map(param_ast => match_by(param_ast, by_type, {
        Identifier: x => [get_identifier_name(x)],
      }))
    ));

  return bindings;
};

const get_binding_names = ({ type, body }) => {
  precondition(type === 'block' || type === 'function');

  // Here we go through some statements because they can contain var declarations
  // - for: for (<DECLARATION>;...;...) <STATEMENT>
  // - if: if (...) <STATEMENT>
  const bindings =
    uniq(flatten(
      body
      .map(statement_ast => match_one(statement_ast.type, {
        // Add the necessary bindings, but only save the name
        // -> We are going to evaluate the init-s later
        VariableDeclaration: () => (
          // Ignore `var` when in block scope: they escape and get registered
          // only by the surrounding function scope
          (type === 'function' || statement_ast.kind !== 'var')
          ? statement_ast.declarations.map(x => get_identifier_name(x.id))
          : []
        ),

        // Contains a block, so we need to parse this scope too
        IfStatement: () => (
          flatten([
            statement_ast.consequent
            ? get_vars_from_block(statement_ast.consequent)
            : [],
            statement_ast.alternate
            ? get_vars_from_block(statement_ast.alternate)
            : [],
          ])
        ),

        ReturnStatement: () => [],
        ExpressionStatement: () => [],
      }))
    ));

  return bindings;
}

class Execution {

}

const ast = parse(`
  const multiply = (x, y) => {
    return x * y;
  };

  const set = (object, key, value) => {
    object[key] = value;
  }
`);

const program = new Program({
  body: ast.program.body,
});

console.log('environment.get_binding:', JSON.stringify(program, null, 2))



/*
Binding a {
  value: OperationValue {
    operation: Operation,
    args: [
      LiteralExpression(1),
      LiteralExpression(2),
    ],
  }
}
*/
