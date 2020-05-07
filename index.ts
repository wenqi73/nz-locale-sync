import * as ts from 'typescript';
import * as fs from 'fs';

export interface Node extends ts.Node {
    importClause?: ts.ImportClause;
    moduleSpecifier?: ts.Expression;
}

// https://github.com/Microsoft/TypeScript/issues/7580#issuecomment-198552002
interface Replacement {
    start: number;
    end: number;
    replacementText: string;
}

const program = ts.createProgram({ rootNames: ['ant-design/locale/default.tsx'], options: {  
  target: ts.ScriptTarget.ES2019,
  module: ts.ModuleKind.CommonJS } 
});

for (const file of program.getSourceFiles()) {
    if (!file.isDeclarationFile) {
        const replacements = getReplacements(file);
        const newText = getNewText(file.getText(), replacements);
        fs.writeFileSync('ng-zorro-antd/default.ts', newText);
    }
}

function getReplacements(file: ts.SourceFile): Replacement[] {
    const replaceInputs = [];
    const fileText = file.getText();
    for (const statement of file.statements) {
        if (statement.kind !== ts.SyntaxKind.ImportDeclaration) {
            continue;
        }
        const node = statement as Node;
        const importClause = getText(node.importClause!.pos, node.importClause!.end);
        const moduleSpecifier = (node.moduleSpecifier as any).text;

        replaceInputs.push({
            start: statement.pos,
            end: statement.end,
            replacementText: `import${importClause} from 'newPath/${moduleSpecifier}';`
        })
    }

    return replaceInputs;

    function getText(pos: number, end: number): string {
        return fileText.substring(pos, end);
    }
}

function getNewText(sourceText: string, replacements: Replacement[]) {
    let newSourceText;
    for (const { start, end, replacementText } of replacements) {
        newSourceText = sourceText.slice(0, start) + replacementText + sourceText.slice(end)
    }
    return newSourceText;
}