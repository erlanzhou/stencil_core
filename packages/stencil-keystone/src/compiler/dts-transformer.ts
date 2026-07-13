import ts from 'typescript';

import { getDecorator } from './ast';
import { collectComponentNames, getComponentDecorator } from './keystone-transformer';

/** The module a compiled component's `KeystoneComponent` type is imported from. */
const DEFAULT_RUNTIME_MODULE = 'stencil-keystone';

/** A `@Prop` on a component: its name, declared type, and whether it is optional. */
interface PropMeta {
  name: string;
  type: ts.TypeNode | undefined;
  optional: boolean;
}

/** An `@Event` on a component: its name and the `EventEmitter<T>` detail type `T`. */
interface EventMeta {
  name: string;
  detail: ts.TypeNode | undefined;
}

/** A `@Method` on a component: its name and declaration (for its signature). */
interface MethodMeta {
  name: string;
  method: ts.MethodDeclaration;
}

/** The type-relevant surface of one component class. */
interface ComponentMeta {
  props: PropMeta[];
  events: EventMeta[];
  methods: MethodMeta[];
}

/** normalized source path → class name → its component metadata. */
type MetaIndex = Map<string, Map<string, ComponentMeta>>;

/**
 * Normalize a file path to a key that matches across the original source
 * (`foo.tsx`) and the declaration pass (`foo.d.ts`) by dropping the extension.
 *
 * @param fileName the file path to normalize
 * @returns the path without its `.d.ts` / `.ts` / `.tsx` extension
 */
const normalizeKey = (fileName: string): string => fileName.replace(/\.d\.ts$|\.tsx?$/, '');

/**
 * The `T` in an `EventEmitter<T>` type annotation, if that is how the field is typed.
 *
 * @param type the field's declared type node
 * @returns the detail type argument, or `undefined` if not an `EventEmitter<T>`
 */
const eventDetailType = (type: ts.TypeNode | undefined): ts.TypeNode | undefined => {
  if (type && ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName) && type.typeName.text === 'EventEmitter') {
    return type.typeArguments?.[0];
  }
  return undefined;
};

/**
 * Collect the type-relevant metadata (`@Prop`/`@Event`/`@Method`) of every
 * component class across a program's source files. Read from the original source
 * (decorators intact) so the declaration pass can retype each component.
 *
 * @param program the TypeScript program to scan
 * @param runtimeModule the module specifier the runtime is imported from
 * @returns an index of component metadata keyed by normalized path and class name
 */
export const collectDeclarationMeta = (program: ts.Program, runtimeModule: string): MetaIndex => {
  const index: MetaIndex = new Map();
  for (const sf of program.getSourceFiles()) {
    if (sf.isDeclarationFile || sf.fileName.includes('node_modules')) {
      continue;
    }
    const componentNames = collectComponentNames(sf, runtimeModule);
    if (componentNames.size === 0) {
      continue;
    }
    const byClass = new Map<string, ComponentMeta>();
    const visit = (node: ts.Node): void => {
      if (ts.isClassDeclaration(node) && node.name && getComponentDecorator(node, componentNames)) {
        byClass.set(node.name.text, collectComponentMeta(node));
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(sf, visit);
    if (byClass.size) {
      index.set(normalizeKey(sf.fileName), byClass);
    }
  }
  return index;
};

/**
 * Read one component class's `@Prop`s, `@Event`s, and `@Method`s.
 *
 * @param node the `@Component`-decorated class declaration
 * @returns the class's component metadata
 */
const collectComponentMeta = (node: ts.ClassDeclaration): ComponentMeta => {
  const props: PropMeta[] = [];
  const events: EventMeta[] = [];
  const methods: MethodMeta[] = [];
  for (const member of node.members) {
    if (ts.isPropertyDeclaration(member) && ts.isIdentifier(member.name)) {
      if (getDecorator(member, 'Prop')) {
        props.push({
          name: member.name.text,
          type: member.type,
          // Optional in JSX when declared optional (`x?:`) or defaulted (`x = v`);
          // a bare `x: T` is required. `@State`/lifecycle are excluded entirely.
          optional: !!member.questionToken || !!member.initializer,
        });
      } else if (getDecorator(member, 'Event')) {
        events.push({ name: member.name.text, detail: eventDetailType(member.type) });
      }
    } else if (ts.isMethodDeclaration(member) && ts.isIdentifier(member.name) && getDecorator(member, 'Method')) {
      methods.push({ name: member.name.text, method: member });
    }
  }
  return { props, events, methods };
};

/**
 * The `on`-prefixed, capitalized handler prop name for an event (`change` → `onChange`).
 *
 * @param eventName the `@Event` name
 * @returns the JSX handler prop name
 */
const handlerName = (eventName: string): string => `on${eventName.charAt(0).toUpperCase()}${eventName.slice(1)}`;

/**
 * Build the `Props` type literal for a component: a member per `@Prop` plus an
 * `on<Event>?: (event: CustomEvent<Detail>) => void` per `@Event`.
 *
 * @param f the node factory
 * @param meta the component's metadata
 * @returns the props type literal node
 */
const buildPropsType = (f: ts.NodeFactory, meta: ComponentMeta): ts.TypeLiteralNode => {
  const anyType = () => f.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword);
  const optional = f.createToken(ts.SyntaxKind.QuestionToken);

  const propSignatures = meta.props.map((p) =>
    f.createPropertySignature(undefined, p.name, p.optional ? optional : undefined, p.type ?? anyType()),
  );

  const eventSignatures = meta.events.map((e) => {
    const detail = e.detail ?? anyType();
    const handlerType = f.createFunctionTypeNode(
      undefined,
      [
        f.createParameterDeclaration(
          undefined,
          undefined,
          'event',
          undefined,
          f.createTypeReferenceNode('CustomEvent', [detail]),
          undefined,
        ),
      ],
      f.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword),
    );
    return f.createPropertySignature(undefined, handlerName(e.name), optional, handlerType);
  });

  return f.createTypeLiteralNode([...propSignatures, ...eventSignatures]);
};

/**
 * Build the `Methods` type literal for a component: a method signature per
 * `@Method` (its parameters and return type, initializers stripped).
 *
 * @param f the node factory
 * @param meta the component's metadata
 * @returns the methods type literal, or `undefined` if the component has no `@Method`
 */
const buildMethodsType = (f: ts.NodeFactory, meta: ComponentMeta): ts.TypeLiteralNode | undefined => {
  if (meta.methods.length === 0) {
    return undefined;
  }
  const signatures = meta.methods.map(({ name, method }) => {
    const params = method.parameters.map((p) =>
      f.createParameterDeclaration(
        undefined,
        p.dotDotDotToken,
        p.name,
        p.questionToken,
        p.type,
        undefined, // a type-literal method signature may not carry an initializer
      ),
    );
    return f.createMethodSignature(undefined, name, undefined, method.typeParameters, params, method.type);
  });
  return f.createTypeLiteralNode(signatures);
};

/**
 * Rewrite a component class declaration in the emitted `.d.ts` into a
 * `KeystoneComponent<Props, Methods>` const, preserving `export`/`declare`.
 *
 * @param f the node factory
 * @param cls the class declaration from the declaration AST
 * @param meta the component's metadata
 * @returns the replacement variable statement
 */
const rewriteToConst = (f: ts.NodeFactory, cls: ts.ClassDeclaration, meta: ComponentMeta): ts.VariableStatement => {
  const propsType = buildPropsType(f, meta);
  const methodsType = buildMethodsType(f, meta);
  const typeArgs = methodsType ? [propsType, methodsType] : [propsType];
  const componentType = f.createTypeReferenceNode('KeystoneComponent', typeArgs);

  const isExported = !!cls.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  const modifiers: ts.Modifier[] = [
    ...(isExported ? [f.createModifier(ts.SyntaxKind.ExportKeyword)] : []),
    f.createModifier(ts.SyntaxKind.DeclareKeyword),
  ];

  return f.createVariableStatement(
    modifiers,
    f.createVariableDeclarationList(
      [f.createVariableDeclaration(cls.name!, undefined, componentType, undefined)],
      ts.NodeFlags.Const,
    ),
  );
};

/**
 * Whether a source file already imports `KeystoneComponent` from the runtime module.
 *
 * @param sf the declaration source file to scan
 * @param runtimeModule the module specifier the runtime is imported from
 * @returns `true` if the import is already present
 */
const hasKeystoneComponentImport = (sf: ts.SourceFile, runtimeModule: string): boolean =>
  sf.statements.some(
    (s) =>
      ts.isImportDeclaration(s) &&
      ts.isStringLiteral(s.moduleSpecifier) &&
      s.moduleSpecifier.text === runtimeModule &&
      s.importClause?.namedBindings !== undefined &&
      ts.isNamedImports(s.importClause.namedBindings) &&
      s.importClause.namedBindings.elements.some((el) => el.name.text === 'KeystoneComponent'),
  );

/**
 * The declaration (`afterDeclarations`) transformer: rewrites each component
 * class in the emitted `.d.ts` into a `KeystoneComponent<Props, Methods>` const
 * (adding the type import), so importing a component yields a JSX-usable,
 * prop-typed reference rather than a bare class.
 *
 * @param index the component metadata collected from the program's source
 * @param runtimeModule the module specifier the runtime is imported from
 * @returns a declaration transformer factory
 */
export const keystoneDeclarationTransformer =
  (index: MetaIndex, runtimeModule: string): ts.TransformerFactory<ts.SourceFile | ts.Bundle> =>
  (context) => {
    const f = context.factory;
    return (node) => {
      if (!ts.isSourceFile(node)) {
        return node;
      }
      const byClass = index.get(normalizeKey(node.fileName));
      if (!byClass) {
        return node;
      }
      let rewrote = false;
      const statements = node.statements.map((stmt) => {
        if (ts.isClassDeclaration(stmt) && stmt.name && byClass.has(stmt.name.text)) {
          rewrote = true;
          return rewriteToConst(f, stmt, byClass.get(stmt.name.text)!);
        }
        return stmt;
      });
      if (!rewrote) {
        return node;
      }
      const head = hasKeystoneComponentImport(node, runtimeModule)
        ? []
        : [
            f.createImportDeclaration(
              undefined,
              f.createImportClause(
                true,
                undefined,
                f.createNamedImports([
                  f.createImportSpecifier(false, undefined, f.createIdentifier('KeystoneComponent')),
                ]),
              ),
              f.createStringLiteral(runtimeModule),
            ),
          ];
      return f.updateSourceFile(node, [...head, ...statements]);
    };
  };

/** Options for {@link emitKeystoneDeclarations}. */
export interface KeystoneDeclarationOptions {
  /** The module a component's `KeystoneComponent` type is imported from. */
  runtimeModule?: string;
}

/**
 * Emit declaration files for a program with keystone components retyped as
 * `KeystoneComponent<Props, Methods>` consts. Only `.d.ts` files are written.
 *
 * @param program the TypeScript program to emit declarations for
 * @param writeFile an optional file writer (defaults to the program's host)
 * @param options declaration emit options (the runtime module specifier)
 * @returns the emit result
 */
export const emitKeystoneDeclarations = (
  program: ts.Program,
  writeFile?: ts.WriteFileCallback,
  options: KeystoneDeclarationOptions = {},
): ts.EmitResult => {
  const runtimeModule = options.runtimeModule ?? DEFAULT_RUNTIME_MODULE;
  const index = collectDeclarationMeta(program, runtimeModule);
  return program.emit(undefined, writeFile, undefined, /* emitOnlyDtsFiles */ true, {
    afterDeclarations: [keystoneDeclarationTransformer(index, runtimeModule)],
  });
};
