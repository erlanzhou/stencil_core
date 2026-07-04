import ts from 'typescript';

import { getDecorator, getDecoratorObject, getObjectProp, modifiersOf } from './ast';

export interface ComponentContext {
  className: string;
  tagName: string;
  styles?: ts.Expression;
  members: string[];
  watched: Record<string, string[]>;
  eventSeeds: ts.Statement[];
  propSeeds: ts.Statement[];
  usesCreateEvent: boolean;
}

export interface TransformerConfig {
  runtimeModule: string;
}

/**
 * Names imported from the runtime module that are compile-time-only markers with
 * no runtime export. After lowering they become dead imports and must be removed.
 */
const COMPILE_TIME_NAMES = new Set(['Component', 'Prop', 'State', 'Watch', 'Event', 'Method', 'EventEmitter']);

/**
 * The single `before` transformer: lowers `@Component`/member decorators on
 * every component class into the runtime's compiled shape.
 */
export const keystoneTransformer =
  (config: TransformerConfig): ts.TransformerFactory<ts.SourceFile> =>
  (context) => {
    const f = context.factory;

    return (sourceFile) => {
      const registrations: ts.Statement[] = [];
      const imports = new Set<string>();

      const visit: ts.Visitor = (node) => {
        if (ts.isClassDeclaration(node) && node.name && getDecorator(node, 'Component')) {
          const { classNode, ctx } = transformComponentClass(node, f);
          imports.add('proxyCustomElement');
          imports.add('baseConstructor');
          if (ctx.usesCreateEvent) imports.add('createEvent');
          registrations.push(...emitRegistration(f, ctx));
          return classNode;
        }
        if (ts.isImportDeclaration(node) && isRuntimeImport(node, config.runtimeModule)) {
          return cleanRuntimeImport(node, f); // drops compile-time-only specifiers (may remove the import)
        }
        return ts.visitEachChild(node, visit, context);
      };

      let sf = ts.visitNode(sourceFile, visit) as ts.SourceFile;

      const importDecl = f.createImportDeclaration(
        undefined,
        f.createImportClause(
          false,
          undefined,
          f.createNamedImports(
            [...imports].map((n) => f.createImportSpecifier(false, undefined, f.createIdentifier(n))),
          ),
        ),
        f.createStringLiteral(config.runtimeModule),
      );

      return f.updateSourceFile(sf, [importDecl, ...sf.statements, ...registrations]);
    };
  };

/** Whether an import declaration pulls from the runtime module (`stencil-keystone`). */
const isRuntimeImport = (node: ts.ImportDeclaration, runtimeModule: string): boolean =>
  ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === runtimeModule;

/**
 * Remove compile-time-only names from a runtime-module import. Returns the
 * trimmed import, or `undefined` to drop it entirely when nothing real remains.
 */
const cleanRuntimeImport = (node: ts.ImportDeclaration, f: ts.NodeFactory): ts.ImportDeclaration | undefined => {
  const named = node.importClause?.namedBindings;
  if (!named || !ts.isNamedImports(named)) {
    return node;
  }
  const kept = named.elements.filter((el) => !COMPILE_TIME_NAMES.has(el.name.text));
  if (kept.length === named.elements.length) {
    return node; // nothing to strip
  }
  if (kept.length === 0) {
    return undefined; // whole import was compile-time-only
  }
  return f.updateImportDeclaration(
    node,
    node.modifiers,
    f.updateImportClause(
      node.importClause!,
      node.importClause!.isTypeOnly,
      node.importClause!.name,
      f.updateNamedImports(named, kept),
    ),
    node.moduleSpecifier,
    node.attributes,
  );
};

/**
 * Re-synthesize every string literal within an expression tree so it prints with
 * the printer's default (double) quote style rather than echoing the quote
 * character from the original source text verbatim. `ts.transpileModule`'s printer
 * reuses unmodified literal nodes as-is (including their raw source text), so a
 * `styles` array quoted with `'` in the author's source would otherwise emit with
 * single quotes while every other literal the compiler emits (tag names, member
 * names, ...) is double-quoted; this keeps emitted quoting deterministic.
 */
const freshenStringLiterals = <T extends ts.Node>(node: T, f: ts.NodeFactory): T => {
  const visit = (n: ts.Node): ts.Node =>
    ts.isStringLiteral(n) ? f.createStringLiteral(n.text) : ts.visitEachChild(n, visit, undefined);
  return visit(node) as T;
};

const transformComponentClass = (
  node: ts.ClassDeclaration,
  f: ts.NodeFactory,
): { classNode: ts.ClassDeclaration; ctx: ComponentContext } => {
  const componentDec = getDecorator(node, 'Component')!;
  const options = getDecoratorObject(componentDec);
  const nameExpr = options && getObjectProp(options, 'name');
  const tagName = nameExpr && ts.isStringLiteralLike(nameExpr) ? nameExpr.text : '';
  const stylesExpr = options && getObjectProp(options, 'styles');

  const ctx: ComponentContext = {
    className: node.name!.text,
    tagName,
    styles: stylesExpr && freshenStringLiterals(stylesExpr, f),
    members: [],
    watched: {},
    eventSeeds: [],
    propSeeds: [],
    usesCreateEvent: false,
  };

  // Member visiting is filled in by later tasks; for now keep members as-is
  // (minus the class-level @Component decorator) and rebuild the constructor.
  const members = rebuildConstructor(node, f, ctx);

  const heritage = node.heritageClauses?.length
    ? node.heritageClauses
    : [
        f.createHeritageClause(ts.SyntaxKind.ExtendsKeyword, [
          f.createExpressionWithTypeArguments(f.createIdentifier('HTMLElement'), undefined),
        ]),
      ];

  const classNode = f.updateClassDeclaration(
    node,
    modifiersOf(node), // drops decorators (incl. @Component)
    node.name,
    node.typeParameters,
    heritage,
    members,
  );

  return { classNode, ctx };
};

/** Rebuild (or synthesize) the constructor so it registers the host at construction. */
const rebuildConstructor = (
  node: ts.ClassDeclaration,
  f: ts.NodeFactory,
  ctx: ComponentContext,
): ts.ClassElement[] => {
  const injected: ts.Statement[] = [
    f.createExpressionStatement(
      f.createCallExpression(f.createIdentifier('baseConstructor'), undefined, [f.createThis()]),
    ),
    ...ctx.eventSeeds,
    ...ctx.propSeeds,
  ];

  const superCall = f.createExpressionStatement(f.createCallExpression(f.createSuper(), undefined, []));

  const existing = node.members.find((m): m is ts.ConstructorDeclaration => ts.isConstructorDeclaration(m));

  const buildBody = (rest: ts.Statement[]): ts.Block =>
    f.createBlock([superCall, ...injected, ...rest], true);

  const newCtor = existing
    ? f.updateConstructorDeclaration(
        existing,
        modifiersOf(existing),
        existing.parameters,
        buildBody(dropSuper(existing.body?.statements ?? [])),
      )
    : f.createConstructorDeclaration(undefined, [], buildBody([]));

  const others = node.members.filter((m) => !ts.isConstructorDeclaration(m));
  return [newCtor, ...others];
};

/** Drop a leading `super(...)` statement so we can re-emit it first ourselves. */
const dropSuper = (stmts: readonly ts.Statement[]): ts.Statement[] =>
  stmts.filter(
    (s) =>
      !(
        ts.isExpressionStatement(s) &&
        ts.isCallExpression(s.expression) &&
        s.expression.expression.kind === ts.SyntaxKind.SuperKeyword
      ),
  );

/** Emit `proxyCustomElement(...)` + `customElements.define(...)`, trailing empties omitted. */
const emitRegistration = (f: ts.NodeFactory, ctx: ComponentContext): ts.Statement[] => {
  const nameLit = f.createStringLiteral(ctx.tagName);
  const classId = f.createIdentifier(ctx.className);

  const membersExpr = ctx.members.length
    ? f.createArrayLiteralExpression(ctx.members.map((m) => f.createStringLiteral(m)))
    : undefined;
  const watchedExpr = Object.keys(ctx.watched).length
    ? f.createObjectLiteralExpression(
        Object.entries(ctx.watched).map(([k, methods]) =>
          f.createPropertyAssignment(
            f.createStringLiteral(k),
            f.createArrayLiteralExpression(methods.map((m) => f.createStringLiteral(m))),
          ),
        ),
      )
    : undefined;

  const optional: (ts.Expression | undefined)[] = [ctx.styles, membersExpr, watchedExpr];
  let last = optional.length;
  while (last > 0 && optional[last - 1] === undefined) last--;
  const tail = optional
    .slice(0, last)
    .map((e) => e ?? f.createIdentifier('undefined'));

  return [
    f.createExpressionStatement(
      f.createCallExpression(f.createIdentifier('proxyCustomElement'), undefined, [nameLit, classId, ...tail]),
    ),
    f.createExpressionStatement(
      f.createCallExpression(
        f.createPropertyAccessExpression(f.createIdentifier('customElements'), 'define'),
        undefined,
        [f.createStringLiteral(ctx.tagName), classId],
      ),
    ),
  ];
};
