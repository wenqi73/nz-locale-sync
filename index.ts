// https://github.com/Microsoft/TypeScript/issues/7580#issuecomment-198552002

import { config } from './config';
import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';
import * as logger from './logger';
import { execSync } from 'child_process';

// Start!
const antDesignName = 'ant-design';
const thirdPackages: string[] = Object.keys(config.thirdPackage).map(p => (config.thirdPackage as any)[p].name);
main();

export function main() {
    try {
        const packageJsonPath = path.join(antDesignName, 'package.json');
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath).toString());

        if (packageJson.version !== config.tag) {
            logger.warning(`Not found matched ${antDesignName}!`);
            throw Error();
        }

        if (isThirdPackageInstalled(thirdPackages)) {
            logger.warning(`Not found third packages in ${antDesignName}!`);
            throw Error();
        }
    } catch (e) {
        installAntd();
    }

    const localeDir = path.resolve(antDesignName, config.localePath);
    const files = fs.readdirSync(localeDir).map(file => path.resolve(localeDir, file));
    // const files = [path.resolve(antDesignName, config.localePath, 'en_US.tsx')];

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
            const destPath = path.resolve(config.dest.path, path.basename(file.fileName, config.extension) + config.dest.extension);

            const jsonText = 'export default ' + JSON.stringify(eval('(' + newText + ')'), null, 2);
            fs.writeFileSync(destPath, jsonText);
            logger.success(`Generate ${destPath}`);
        }
    }
}

function isThirdPackageInstalled(packages: string[]) {
    return packages.length > 0 && packages.every(p => fs.readdirSync(path.resolve(antDesignName, 'node_modules', p)).length > 0);
}

function installAntd() {
    logger.info(`Deleting ${antDesignName}.`);
    execSync(`rm -rf ${antDesignName}`);

    logger.info(`Downloading ${antDesignName} ${config.tag} version...`);
    execSync(`git clone https://github.com/ant-design/ant-design.git --branch ${config.tag} --depth=1
 `);

    logger.info(`Installing ${thirdPackages}...`);
    execSync(`cd ${antDesignName} && npm install ${thirdPackages.join(' ')}`);
}

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
    const thirdPackage = (config as any).thirdPackage[name];
    let realPath, replacementText;
    if (thirdPackage) {
        realPath = path.resolve(antDesignName, 'node_modules', importInfo[name] + thirdPackage.extension);
    } else {
        realPath = path.resolve(sourceFile.fileName, '../', importInfo[name] + config.extension);
    }
    const file = ts.createSourceFile(realPath, fs.readFileSync(realPath).toString(), ts.ScriptTarget.ES2019);
    const moduleText: string = getFileExportDefaultText(file);

    if (ts.isSpreadAssignment(node)) {
        // replace first "{" and last "," "}" to null
        replacementText = moduleText.replace(/^[^{]*{|(,\s)*}[^}]*$/g, '');
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
