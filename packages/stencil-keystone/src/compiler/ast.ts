import ts from 'typescript';

/** Find a decorator named `name` (e.g. `Component`) on a node, if present. */
export const getDecorator = (node: ts.HasDecorators, name: string): ts.Decorator | undefined =>
  ts.getDecorators(node)?.find((d) => {
    const expr = d.expression;
    const id = ts.isCallExpression(expr) ? expr.expression : expr;
    return ts.isIdentifier(id) && id.text === name;
  });

/** The first call-expression argument of a decorator, if it is an object literal. */
export const getDecoratorObject = (dec: ts.Decorator): ts.ObjectLiteralExpression | undefined => {
  const expr = dec.expression;
  if (ts.isCallExpression(expr) && expr.arguments.length && ts.isObjectLiteralExpression(expr.arguments[0])) {
    return expr.arguments[0];
  }
  return undefined;
};

/** A string-literal argument of a decorator call, e.g. `@Watch('value')`. */
export const getDecoratorStringArg = (dec: ts.Decorator): string | undefined => {
  const expr = dec.expression;
  if (ts.isCallExpression(expr) && expr.arguments.length && ts.isStringLiteralLike(expr.arguments[0])) {
    return expr.arguments[0].text;
  }
  return undefined;
};

/** Read a property from an object literal by name. */
export const getObjectProp = (obj: ts.ObjectLiteralExpression, name: string): ts.Expression | undefined => {
  for (const p of obj.properties) {
    if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === name) {
      return p.initializer;
    }
  }
  return undefined;
};

/** The non-decorator modifiers of a node (used to rebuild it without decorators). */
export const modifiersOf = (node: ts.HasModifiers): ts.Modifier[] | undefined =>
  ts.getModifiers(node) as ts.Modifier[] | undefined;
