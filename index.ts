// https://github.com/Microsoft/TypeScript/issues/7580#issuecomment-198552002

const importReflect = {
    // ant-design path
    basePath: `${__dirname}/../ant-design/`,

    // ant-design i18n path
    localePath: 'components/locale/',

    // ant-design i18n file extension
    extension: '.tsx',

    /**
     * third package, such as following line
     * in ant-design/components/locale/default.tsx
     * `import Pagination from 'rc-pagination/lib/locale`/en_US';
     */
    thirdPackage: {
        Pagination: {
            extension: '.js'
        },
        CalendarLocale: {
            extension: '.js'
        }
    },

    // target path
    dest: {
        path: `${__dirname}/../ng-zorro-antd/components/i18n/languages`,
        extension: '.ts'
    }
};

import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';

interface Replacement {
    pos: number;
    end: number;
    replacementText: string;
}

interface VariableInfo {
    [key: string]: { node: ts.Node };
}

interface ImportInfo {
    [key: string]: string;
}

function main() {
    const files = fs
        .readdirSync(importReflect.basePath + importReflect.localePath)
        .map(file => path.resolve(importReflect.basePath, importReflect.localePath, file));
    // const files = [path.resolve(importReflect.basePath, importReflect.localePath, 'hy_AM.tsx')];

    const program = ts.createProgram({
        rootNames: files,
        options: {
            target: ts.ScriptTarget.ES2019,
            module: ts.ModuleKind.CommonJS
        }
    });

    for (const file of program.getSourceFiles()) {
        if (!file.isDeclarationFile) {
            const newText = getFileExportDefaultText(file);
            const destPath = path.resolve(
                importReflect.dest.path,
                path.basename(file.fileName, importReflect.extension) + importReflect.dest.extension
            );

            const jsonText = 'export default ' + JSON.stringify(eval('(' + newText + ')'), null, 2);
            fs.writeFileSync(destPath, jsonText);
            console.log('\x1b[32m%s\x1b[0m', `Generate ${destPath}`); //cyan
        }
    }
}

main();

function getFileExportDefaultText(file: ts.SourceFile): string {
    const replacementObj = getExportDefaultText(file);
    const { exportStart, exportEnd, replaceInputs } = replacementObj;
    return getReplacedExportText(file, exportStart, exportEnd, replaceInputs);
}

/**
 * Get export default variable value text recursively
 * @param file
 *
 * ** c.ts
 * export default C = 'c';
 *
 * ** a.ts
 * import C from './c'
 * export default A = {
 *     C,
 *     D: 'd'
 * }
 *
 * then will return
 * {
 *   C: 'c',
 *   D: 'd'
 * }
 */
function getExportDefaultText(file: ts.SourceFile): any {
    const replaceInputs: Replacement[] = [];
    const variableObj: VariableInfo = {};
    const exportObj: VariableInfo = {};
    const importObj: ImportInfo = {};
    let exportDefaultName: string = '';
    let exportStart: number = 0;
    let exportEnd: number = 0;

    for (const statement of file.statements) {
        if (ts.isImportDeclaration(statement)) {
            let importClause = (statement as ts.ImportDeclaration).importClause;
            let importName: string[] = [];

            // import <-A-> from 'B';
            if (importClause?.name) {
                importName = [importClause?.name.getText(file)];

                // import <-{ A, C }-> from 'B';
            } else if (importClause?.namedBindings) {
                // @ts-ignore
                importName = importClause?.namedBindings.elements.map(e => e.name.text);
            }

            // import A from '<-B->';
            const moduleSpecifier: string = ((statement as ts.ImportDeclaration).moduleSpecifier as any).text;
            importName.forEach(name => (importObj[name] = moduleSpecifier));

            continue;
        }

        if (statement.kind === ts.SyntaxKind.ExportAssignment) {
            exportDefaultName = (statement as ts.ExportAssignment).expression.getText(file);
            exportObj[exportDefaultName] = {
                node: (statement as ts.ExportAssignment).expression
            };
        }

        // const a = 'a';
        if (statement.kind === ts.SyntaxKind.VariableStatement) {
            const initializer: ts.Expression = (statement as ts.VariableStatement).declarationList.declarations[0].initializer!;
            const variableName = (statement as ts.VariableStatement).declarationList.declarations[0].name.getText(file);
            variableObj[variableName] = { node: initializer };
        }

        // export default a
        if (ts.isExpressionStatement(statement) && getExportsDefaultExpression(statement.expression)) {
            const exportDefaultExpression = getExportsDefaultExpression(statement.expression);
            exportDefaultName = exportDefaultExpression!.getText(file);
            let result = {
                [exportDefaultName]: {
                    node: exportDefaultExpression
                }
            };

            /**
             * find variable, make sure value is real value. e.g.
             * var local = {};
             * var _default = locale;
             * exports.default = _default;
             */
            while (ts.isIdentifier(variableObj[exportDefaultName]?.node)) {
                exportDefaultName = variableObj[exportDefaultName].node.getText(file);
                result = { [exportDefaultName]: variableObj[exportDefaultName] };
            }

            Object.assign(exportObj, result);
        }
    }

    /**
     * import a from 'B';
     * export default a
     */
    if (importObj[exportDefaultName]) {
        const { node } = exportObj[exportDefaultName];
        exportStart = node.pos;
        exportEnd = node.end;
        visitModule(exportDefaultName, node, file, importObj, replaceInputs);

        /**
         * const A = {
         *   ...
         * };
         * or
         * const A = 'a';
         *
         * export default A
         */
    } else if (variableObj[exportDefaultName]) {
        const { node } = variableObj[exportDefaultName];
        exportStart = node.pos;
        exportEnd = node.end;
        visitObjectProperty(node);
    }

    return {
        exportStart,
        exportEnd,
        replaceInputs
    };

    /**
     * visit a node, which can be
     * - Key with ObjectLiteralExpression
     * ```
     * ->a: {
     *   b: any
     * }<-
     * ```
     *
     * - ObjectLiteralExpression:
     * ```
     * a: ->{
     *   b: any
     * }<-
     * ```
     * - SpreadAssignment:
     * ```
     * a: {
     *    ->...b<-
     * }
     * ```
     *
     * - ShorthandPropertyAssignment:
     * ```
     * a: {
     *   ->b<-
     * }
     * ```
     *
     * - PropertyAssignment:
     * ```
     * a: {
     *  ->b: any<-
     * }
     * ```
     * @param node
     */
    function visitObjectProperty(node: ts.Node) {
        let initialText = '';
        const initializer = (node as ts.VariableDeclaration)?.initializer;
        if (initializer && ts.isObjectLiteralExpression(initializer!)) {
            initializer.properties.forEach(p => visitObjectProperty(p));
            return;
        } else if (ts.isObjectLiteralExpression(node)) {
            node.properties.forEach(p => visitObjectProperty(p));
            return;
        } else if (ts.isSpreadAssignment(node)) {
            initialText = (node as ts.SpreadAssignment).expression.getText(file);
        } else if (ts.isShorthandPropertyAssignment(node)) {
            initialText = (node.name as ts.Identifier).text;
        } else if (ts.isPropertyAssignment(node)) {
            initialText = (node.initializer as ts.Identifier).text;
        } else {
            initialText = node.getText(file);
        }

        if (importObj[initialText]) {
            visitModule(initialText, node, file, importObj, replaceInputs);
        } else if (variableObj[initialText]) {
            const newNode = variableObj[initialText].node;
            if (ts.isObjectLiteralExpression(newNode)) {
                visitObjectProperty(newNode);
            }
            replaceInputs.push({
                pos: node.pos,
                end: node.end,
                replacementText: `${(node as ts.PropertyAssignment).name.getText(file)}: ${newNode.getText(file)}`
            });
        }
    }
}

/**
 *
 * @param sourceFile
 *
 * a complete module file content is
 * ```
 * export default NAME
 * ```
 * but we only want "NAME", so we need the export value position information.
 *
 * @param exportValueStart
 * @param exportValueEnd
 * @param replacements
 */
function getReplacedExportText(
    sourceFile: ts.SourceFile,
    exportValueStart: number,
    exportValueEnd: number,
    replacements: Replacement[]
): string {
    const fileText = sourceFile.getFullText();
    let newExportDefaultText = fileText.substring(exportValueStart, exportValueEnd);
    for (const { pos, end, replacementText } of replacements.reverse()) {
        newExportDefaultText =
            newExportDefaultText.slice(0, pos - exportValueStart) + replacementText + newExportDefaultText.slice(end - exportValueStart);
    }
    return newExportDefaultText;
}

/**
 * if expression is "exports.default = xxx"
 * @param expression
 */
function getExportsDefaultExpression(expression: ts.Expression): ts.Node | null {
    const left = (expression as ts.BinaryExpression).left as ts.PropertyAccessExpression;
    const right = (expression as ts.BinaryExpression).right as ts.Identifier;
    if ((left?.expression as ts.Identifier)?.text === 'exports' && left.name.text === 'default' && !!right.text) {
        return right;
    }
    return null;
}

/**
 * when come a module text
 * ```
 * import A from '->a<-'
 *
 * const b = A;
 * ```
 * @param name: module name
 * @param node: the node which referred module
 * @param sourceFile
 * @param importInfo: all the imports stored before
 * @param replaceInputs
 */
function visitModule(name: string, node: ts.Node, sourceFile: ts.SourceFile, importInfo: ImportInfo, replaceInputs: Replacement[]): void {
    const thirdPackage = (importReflect as any).thirdPackage[name];
    let realPath, replacementText;
    if (thirdPackage) {
        realPath = path.resolve(importReflect.basePath, 'node_modules', importInfo[name] + thirdPackage.extension);
    } else {
        realPath = path.resolve(sourceFile.fileName, '../', importInfo[name] + importReflect.extension);
    }
    const file = ts.createSourceFile(realPath, fs.readFileSync(realPath).toString(), ts.ScriptTarget.ES2019);
    const moduleText: string = getFileExportDefaultText(file);

    if (ts.isSpreadAssignment(node)) {
        // replace first "{" and last "," "}" to null
        replacementText = moduleText.replace(/^[^{]*{|,[^,]*}[^}]*$/g, '');
    } else if (ts.isShorthandPropertyAssignment(node)) {
        replacementText = `${name}:${moduleText}`;
    } else {
        replacementText = moduleText;
    }
    replaceInputs.push({
        pos: node.pos,
        end: node.end,
        replacementText
    });
}
