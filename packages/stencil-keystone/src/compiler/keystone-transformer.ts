import ts from 'typescript';

import { getDecorator, getDecoratorObject, getDecoratorStringArg, getObjectProp, modifiersOf } from './ast';

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
 * Local binding names imported as `Component` from the runtime module (honors `as` aliasing).
 *
 * @param sf the source file whose imports to scan
 * @param runtimeModule the module specifier the runtime is imported from
 * @returns the set of local identifiers bound to the runtime's `Component`
 */
const collectComponentNames = (sf: ts.SourceFile, runtimeModule: string): Set<string> => {
  const names = new Set<string>();
  for (const stmt of sf.statements) {
    if (
      ts.isImportDeclaration(stmt) &&
      ts.isStringLiteral(stmt.moduleSpecifier) &&
      stmt.moduleSpecifier.text === runtimeModule
    ) {
      const named = stmt.importClause?.namedBindings;
      if (named && ts.isNamedImports(named)) {
        for (const el of named.elements) {
          if ((el.propertyName ?? el.name).text === 'Component') {
            names.add(el.name.text);
          }
        }
      }
    }
  }
  return names;
};

/**
 * The class's `@Component` decorator, matched by import provenance (its identifier
 * resolves to the runtime `Component`).
 *
 * @param node the class declaration to inspect
 * @param componentNames local names known to bind the runtime `Component`
 * @returns the matching decorator, or `undefined` if the class has none
 */
const getComponentDecorator = (node: ts.ClassDeclaration, componentNames: Set<string>): ts.Decorator | undefined =>
  ts.getDecorators(node)?.find((d) => {
    const expr = d.expression;
    const id = ts.isCallExpression(expr) ? expr.expression : expr;
    return ts.isIdentifier(id) && componentNames.has(id.text);
  });

/**
 * Whether `code` has at least one class carrying a provenance-matched `@Component`.
 *
 * @param code the source text to scan
 * @param fileName the file path (selects the TS/TSX script kind)
 * @param runtimeModule the module specifier the runtime is imported from
 * @returns `true` if a keystone component class is present, otherwise `false`
 */
export const containsKeystoneComponent = (code: string, fileName: string, runtimeModule: string): boolean => {
  const sf = ts.createSourceFile(
    fileName,
    code,
    ts.ScriptTarget.ES2022,
    /* setParentNodes */ true,
    /\.[jt]sx$/.test(fileName) ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const componentNames = collectComponentNames(sf, runtimeModule);
  if (componentNames.size === 0) {
    return false;
  }
  let found = false;
  const walk = (n: ts.Node): void => {
    if (found) return;
    if (ts.isClassDeclaration(n) && getComponentDecorator(n, componentNames)) {
      found = true;
      return;
    }
    ts.forEachChild(n, walk);
  };
  ts.forEachChild(sf, walk);
  return found;
};

/**
 * The single `before` transformer: lowers `@Component`/member decorators on
 * every component class into the runtime's compiled shape.
 *
 * @param config the transformer configuration (the runtime module specifier)
 * @returns a TypeScript transformer factory for the emit pipeline
 */
export const keystoneTransformer =
  (config: TransformerConfig): ts.TransformerFactory<ts.SourceFile> =>
  (context) => {
    const f = context.factory;

    return (sourceFile) => {
      const componentNames = collectComponentNames(sourceFile, config.runtimeModule);
      const registrations: ts.Statement[] = [];
      const imports = new Set<string>();

      const visit: ts.Visitor = (node) => {
        if (ts.isClassDeclaration(node) && node.name && getComponentDecorator(node, componentNames)) {
          const { classNode, ctx } = transformComponentClass(node, f, componentNames);
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

      const sf = ts.visitNode(sourceFile, visit) as ts.SourceFile;

      const head = imports.size
        ? [
            f.createImportDeclaration(
              undefined,
              f.createImportClause(
                false,
                undefined,
                f.createNamedImports(
                  [...imports].map((n) => f.createImportSpecifier(false, undefined, f.createIdentifier(n))),
                ),
              ),
              f.createStringLiteral(config.runtimeModule),
            ),
          ]
        : [];

      return f.updateSourceFile(sf, [...head, ...sf.statements, ...registrations]);
    };
  };

/**
 * Whether an import declaration pulls from the runtime module (`stencil-keystone`).
 *
 * @param node the import declaration to test
 * @param runtimeModule the module specifier the runtime is imported from
 * @returns `true` when the import's module specifier is the runtime module
 */
const isRuntimeImport = (node: ts.ImportDeclaration, runtimeModule: string): boolean =>
  ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === runtimeModule;

/**
 * Remove compile-time-only names from a runtime-module import.
 *
 * @param node the runtime-module import declaration to trim
 * @param f the node factory
 * @returns the trimmed import, or `undefined` to drop it when nothing real remains
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
 *
 * @param node the expression tree to re-synthesize
 * @param f the node factory
 * @returns an equivalent tree with every string literal freshly created
 */
const freshenStringLiterals = <T extends ts.Node>(node: T, f: ts.NodeFactory): T => {
  const visit = (n: ts.Node): ts.Node =>
    ts.isStringLiteral(n) ? f.createStringLiteral(n.text) : ts.visitEachChild(n, visit, undefined);
  return visit(node) as T;
};

/**
 * Lower a `@Component` class into its compiled shape: strip the decorator, seed
 * the constructor, and collect its metadata into a {@link ComponentContext}.
 *
 * @param node the `@Component`-decorated class declaration
 * @param f the node factory
 * @param componentNames local names known to bind the runtime `Component`
 * @returns the rewritten class and the collected component context
 */
const transformComponentClass = (
  node: ts.ClassDeclaration,
  f: ts.NodeFactory,
  componentNames: Set<string>,
): { classNode: ts.ClassDeclaration; ctx: ComponentContext } => {
  const componentDec = getComponentDecorator(node, componentNames)!;
  const options = getDecoratorObject(componentDec);
  const nameExpr = options && getObjectProp(options, 'name');
  if (!nameExpr || !ts.isStringLiteralLike(nameExpr)) {
    throw new Error(
      `@Component on "${node.name?.text ?? '(anonymous)'}" requires a string-literal "name" option` +
        (nameExpr ? ' (got a non-literal expression)' : options ? ' (missing "name")' : ' (missing options object)'),
    );
  }
  const tagName = nameExpr.text;
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

  const kept = collectMembers(node, f, ctx);
  const members = rebuildConstructor(kept, f, ctx);

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

/**
 * Lower member decorators, populating `ctx`.
 *
 * @param node the component class whose members to process
 * @param f the node factory
 * @param ctx the component context to populate (members, watched, seeds)
 * @returns the class members to keep as-is (decorated fields are dropped)
 */
const collectMembers = (node: ts.ClassDeclaration, f: ts.NodeFactory, ctx: ComponentContext): ts.ClassElement[] => {
  const kept: ts.ClassElement[] = [];
  for (const member of node.members) {
    if (ts.isPropertyDeclaration(member) && ts.isIdentifier(member.name)) {
      const isProp = !!getDecorator(member, 'Prop');
      const isState = !!getDecorator(member, 'State');
      if (isProp || isState) {
        const name = member.name.text;
        ctx.members.push(name);
        if (member.initializer) {
          ctx.propSeeds.push(
            f.createExpressionStatement(
              f.createAssignment(f.createPropertyAccessExpression(f.createThis(), name), member.initializer),
            ),
          );
        }
        continue; // drop the field: the runtime accessor backs it
      }
      if (getDecorator(member, 'Event')) {
        const name = member.name.text;
        ctx.usesCreateEvent = true;
        ctx.eventSeeds.push(
          f.createExpressionStatement(
            f.createAssignment(
              f.createPropertyAccessExpression(f.createThis(), name),
              f.createCallExpression(f.createIdentifier('createEvent'), undefined, [
                f.createThis(),
                f.createStringLiteral(name),
              ]),
            ),
          ),
        );
        continue; // drop the field
      }
    }
    if (ts.isMethodDeclaration(member) && ts.isIdentifier(member.name)) {
      const watch = getDecorator(member, 'Watch');
      if (watch) {
        const prop = getDecoratorStringArg(watch);
        if (prop) {
          (ctx.watched[prop] ??= []).push(member.name.text);
        }
        kept.push(stripDecorators(member, f));
        continue;
      }
      if (getDecorator(member, 'Method')) {
        kept.push(stripDecorators(member, f));
        continue;
      }
    }
    kept.push(member);
  }
  return kept;
};

/**
 * Return a method with all its decorators removed.
 *
 * @param member the method declaration to rebuild
 * @param f the node factory
 * @returns the method with its decorators stripped and everything else preserved
 */
const stripDecorators = (member: ts.MethodDeclaration, f: ts.NodeFactory): ts.MethodDeclaration =>
  f.updateMethodDeclaration(
    member,
    modifiersOf(member), // drops decorators
    member.asteriskToken,
    member.name,
    member.questionToken,
    member.typeParameters,
    member.parameters,
    member.type,
    member.body,
  );

/**
 * Rebuild (or synthesize) the constructor so it registers the host at construction.
 *
 * @param kept the class members to keep (may include an author constructor)
 * @param f the node factory
 * @param ctx the component context supplying the event/prop constructor seeds
 * @returns the class members with the constructor first, registering at construction
 */
const rebuildConstructor = (kept: ts.ClassElement[], f: ts.NodeFactory, ctx: ComponentContext): ts.ClassElement[] => {
  const injected: ts.Statement[] = [
    f.createExpressionStatement(
      f.createCallExpression(f.createIdentifier('baseConstructor'), undefined, [f.createThis()]),
    ),
    ...ctx.eventSeeds,
    ...ctx.propSeeds,
  ];

  const superCall = f.createExpressionStatement(f.createCallExpression(f.createSuper(), undefined, []));

  const existing = kept.find((m): m is ts.ConstructorDeclaration => ts.isConstructorDeclaration(m));

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

  const others = kept.filter((m) => !ts.isConstructorDeclaration(m));
  return [newCtor, ...others];
};

/**
 * Drop the `super(...)` call statement from a constructor body so we can re-emit
 * it first ourselves (a constructor may only legally contain one).
 *
 * @param stmts the original constructor body statements
 * @returns the statements with any direct `super(...)` call removed
 */
const dropSuper = (stmts: readonly ts.Statement[]): ts.Statement[] =>
  stmts.filter(
    (s) =>
      !(
        ts.isExpressionStatement(s) &&
        ts.isCallExpression(s.expression) &&
        s.expression.expression.kind === ts.SyntaxKind.SuperKeyword
      ),
  );

/**
 * Emit `proxyCustomElement(...)` + `customElements.define(...)`, trailing empties omitted.
 *
 * @param f the node factory
 * @param ctx the component context supplying the tag name, styles, members, and watched map
 * @returns the registration statements to append after the class
 */
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
