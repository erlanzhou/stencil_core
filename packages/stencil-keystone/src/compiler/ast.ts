import ts from 'typescript';

/**
 * Find a decorator named `name` (e.g. `Component`) on a node, if present.
 *
 * @param node the node whose decorators to search
 * @param name the decorator identifier to match
 * @returns the matching decorator, or `undefined` if none is present
 */
export const getDecorator = (node: ts.HasDecorators, name: string): ts.Decorator | undefined =>
  ts.getDecorators(node)?.find((d) => {
    const expr = d.expression;
    const id = ts.isCallExpression(expr) ? expr.expression : expr;
    return ts.isIdentifier(id) && id.text === name;
  });

/**
 * The first call-expression argument of a decorator, if it is an object literal.
 *
 * @param dec the decorator to read
 * @returns the object-literal argument, or `undefined` if there is none
 */
export const getDecoratorObject = (dec: ts.Decorator): ts.ObjectLiteralExpression | undefined => {
  const expr = dec.expression;
  if (ts.isCallExpression(expr) && expr.arguments.length && ts.isObjectLiteralExpression(expr.arguments[0])) {
    return expr.arguments[0];
  }
  return undefined;
};

/**
 * A string-literal argument of a decorator call, e.g. `@Watch('value')`.
 *
 * @param dec the decorator to read
 * @returns the string-literal argument's text, or `undefined` if the first argument is not a string literal
 */
export const getDecoratorStringArg = (dec: ts.Decorator): string | undefined => {
  const expr = dec.expression;
  if (ts.isCallExpression(expr) && expr.arguments.length && ts.isStringLiteralLike(expr.arguments[0])) {
    return expr.arguments[0].text;
  }
  return undefined;
};

/**
 * Read a property from an object literal by name.
 *
 * @param obj the object literal to read from
 * @param name the property name to look up
 * @returns the property's initializer expression, or `undefined` if absent
 */
export const getObjectProp = (obj: ts.ObjectLiteralExpression, name: string): ts.Expression | undefined => {
  for (const p of obj.properties) {
    if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === name) {
      return p.initializer;
    }
  }
  return undefined;
};

/**
 * The non-decorator modifiers of a node (used to rebuild it without decorators).
 *
 * @param node the node whose modifiers to read
 * @returns the node's modifiers with decorators excluded, or `undefined` if it has none
 */
export const modifiersOf = (node: ts.HasModifiers): ts.Modifier[] | undefined =>
  ts.getModifiers(node) as ts.Modifier[] | undefined;
