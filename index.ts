import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';

// export interface Node extends ts.Node {
//     importClause?: ts.ImportClause;
//     moduleSpecifier?: ts.Expression;
// }

// https://github.com/Microsoft/TypeScript/issues/7580#issuecomment-198552002
interface Replacement {
    pos: number;
    end: number;
    replacementText: string;
}

interface VariableInfo {
    [key: string]: { initializer: any; pos: number; end: number };
}

const importReflect = {
    basePath: `${__dirname}/../ant-design/`,
    localePath: 'components/locale/',
    extension: '.tsx',
    thirdPackage: {
        Pagination: {
            extension: '.js'
        },
        CalendarLocale: {
            extension: '.js'
        }
    },
    dest: {
        path: 'ng-zorro-antd/i18n/',
        extension: '.json'
    }

    // DatePicker: '../date-picker/locale/',
    // TimePicker: '../time-picker/locale/',
    // Calendar: '../calendar/locale/',
};

// const files = fs.readdirSync(importReflect.basePath + importReflect.localePath).map(file => path.resolve(importReflect.basePath, importReflect.localePath, file));

const files = [path.resolve(importReflect.basePath, importReflect.localePath, 'en_US.tsx')];

const program = ts.createProgram({
    rootNames: files,
    options: {
        target: ts.ScriptTarget.ES2019,
        module: ts.ModuleKind.CommonJS
    }
});

for (const file of program.getSourceFiles()) {
    if (!file.isDeclarationFile) {
        const newText = getExportDefaultRecursively(file);
        const destPath = path.resolve(
            importReflect.dest.path,
            path.basename(file.fileName, importReflect.extension) + importReflect.dest.extension
        );

        const jsonText = JSON.stringify(eval('(' + newText + ')'), null, 2);
        fs.writeFileSync(destPath, jsonText);
    }
}

function getExportDefaultRecursively(file: ts.SourceFile): string {
    const replacementObj = getExportDefaultText(file);
    const { exportStart, exportEnd, replaceInputs } = replacementObj;
    return getNewExportText(file, exportStart, exportEnd, replaceInputs);
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
    let exportDefaultName: string = '';
    const variableObj: VariableInfo = {};
    const exportObj: VariableInfo = {};
    const importObj: any = {};
    let exportStart: number = 0;
    let exportEnd: number = 0;

    for (const statement of file.statements) {
        if (statement.kind === ts.SyntaxKind.ImportDeclaration) {
            let importClause = (statement as ts.ImportDeclaration).importClause;
            let importName: string[] = [];

            // import <-A-> from 'B';
            if (importClause?.name) {
                importName = [importClause?.name?.text];

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
            // @ts-ignore
            exportDefaultName = (statement as ts.ExportAssignment).expression.text;
            Object.assign(exportObj, {
                [exportDefaultName]: {
                    initializer: (statement as ts.ExportAssignment).expression,
                    pos: (statement as ts.ExportAssignment).expression.pos,
                    end: (statement as ts.ExportAssignment).expression.end
                }
            });
        }

        // "exports.default = name" in .js file
        // @ts-ignore
        // @ts-ignore
        if (
            statement.kind === ts.SyntaxKind.ExpressionStatement &&
            // @ts-ignore
            statement.expression.left?.expression.text === 'exports' &&
            // @ts-ignore
            statement.expression.left?.name.text === 'default' &&
            // @ts-ignore
            statement.expression.right.text
        ) {
            // @ts-ignore
            exportDefaultName = statement.expression.right.text;
            let obj = {
                [exportDefaultName]: {
                    // @ts-ignore
                    initializer: statement.expression.right,
                    // @ts-ignore
                    pos: (statement as ts.ExportAssignment).expression.right.pos,
                    // @ts-ignore
                    end: (statement as ts.ExportAssignment).expression.right.end
                }
            };
            while (variableObj[exportDefaultName]) {
                if (variableObj[exportDefaultName].initializer.text) {
                    exportDefaultName = variableObj[exportDefaultName].initializer.text;
                    obj = {
                        [exportDefaultName]: variableObj[exportDefaultName]
                    };
                } else {
                    break;
                }
            }

            Object.assign(exportObj, obj);
        }

        if (statement.kind === ts.SyntaxKind.VariableStatement) {
            const initializer: ts.Expression = (statement as ts.VariableStatement).declarationList.declarations[0].initializer!;
            // @ts-ignore
            const name: string = (statement as ts.VariableStatement).declarationList.declarations[0].name.text;
            Object.assign(variableObj, {
                [name]: {
                    initializer: initializer,
                    pos: initializer.pos,
                    end: initializer.end
                }
            });
        }
    }

    // import A from B
    // export default A
    if (importObj[exportDefaultName]) {
        const thirdPackage = (importReflect as any).thirdPackage[exportDefaultName];
        let realPath;
        if (thirdPackage) {
            realPath = path.resolve(importReflect.basePath, 'node_modules', importObj[exportDefaultName] + thirdPackage.extension);
        } else {
            realPath = path.resolve(file.fileName, '../', importObj[exportDefaultName] + importReflect.extension);
        }
        const sourceFile = ts.createSourceFile(realPath, fs.readFileSync(realPath).toString(), ts.ScriptTarget.ES2019);
        const newObjText: string = getExportDefaultRecursively(sourceFile);
        exportStart = exportObj[exportDefaultName].pos;
        exportEnd = exportObj[exportDefaultName].end;

        replaceInputs.push({
            pos: exportStart,
            end: exportEnd,
            replacementText: newObjText
        });
    } else if (variableObj[exportDefaultName]) {
        const { pos, end, initializer } = variableObj[exportDefaultName];
        exportStart = pos;
        exportEnd = end;
        if (initializer.properties) {
            for (const property of initializer.properties) {
                findNestedProperty(property);
            }
        }
    }

    return {
        exportStart,
        exportEnd,
        replaceInputs
    };

    function findNestedProperty(property: any) {
        if (property?.initializer?.properties) {
            for (const p of property.initializer.properties) {
                findNestedProperty(p);
            }
            return;
        }
        let initialText = '';
        if (property.kind === ts.SyntaxKind.SpreadAssignment) {
            // @ts-ignore
            initialText = (property as ts.SpreadAssignment).expression.text;
        } else if (property.kind === ts.SyntaxKind.ShorthandPropertyAssignment) {
            initialText = (property.name as ts.Identifier)!.text;
        } else if (property.kind === ts.SyntaxKind.PropertyAssignment) {
            initialText = (property.initializer as ts.Identifier)!.text;
        }
        if (importObj[initialText]) {
            const thirdPackage = (importReflect as any).thirdPackage[initialText];
            let realPath;
            if (thirdPackage) {
                realPath = path.resolve(importReflect.basePath, 'node_modules', importObj[initialText] + thirdPackage.extension);
            } else {
                realPath = path.resolve(file.fileName, '../', importObj[initialText] + importReflect.extension);
            }
            const sourceFile = ts.createSourceFile(realPath, fs.readFileSync(realPath).toString(), ts.ScriptTarget.ES2019);
            const newObjText: string = getExportDefaultRecursively(sourceFile);

            replaceInputs.push({
                pos: property.pos,
                end: property.end,
                replacementText:
                    property.kind === ts.SyntaxKind.SpreadAssignment
                        ? newObjText.replace(/^[^{]*{|,[^,]*}[^}]*$/g, '')
                        : `${initialText}:${newObjText}`
            });
        } else if (variableObj[initialText]) {
            replaceInputs.push({
                pos: property.pos,
                end: property.end,
                replacementText: `${property.name.text}: '${variableObj[initialText].initializer.text}'`
            });
        }
    }
}

function getNewExportText(
    sourceFile: ts.SourceFile,
    exportInitializerStart: number,
    exportInitializerEnd: number,
    replacements: Replacement[]
): string {
    const fileText = sourceFile.getFullText();
    let newExportDefaultText = fileText.substring(exportInitializerStart, exportInitializerEnd);
    for (const { pos, end, replacementText } of replacements.reverse()) {
        newExportDefaultText =
            newExportDefaultText.slice(0, pos - exportInitializerStart) +
            replacementText +
            newExportDefaultText.slice(end - exportInitializerStart);
    }
    return newExportDefaultText;
}
