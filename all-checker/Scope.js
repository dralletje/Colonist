
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
