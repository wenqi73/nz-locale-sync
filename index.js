"use strict";
// https://github.com/Microsoft/TypeScript/issues/7580#issuecomment-198552002
exports.__esModule = true;
exports.main = void 0;
var config_1 = require("./config");
var ts = require("typescript");
var fs = require("fs");
var path = require("path");
var logger = require("./logger");
var child_process_1 = require("child_process");
// Start!
var antDesignName = 'ant-design';
var thirdPackages = Object.keys(config_1.config.thirdPackage).map(function (p) { return config_1.config.thirdPackage[p].name; });
main();
function main() {
    try {
        var packageJsonPath = path.join(antDesignName, 'package.json');
        var packageJson = JSON.parse(fs.readFileSync(packageJsonPath).toString());
        if (packageJson.version !== config_1.config.tag) {
            logger.warning("Not found matched " + antDesignName + "!");
            throw Error();
        }
        if (isThirdPackageInstalled(thirdPackages)) {
            logger.warning("Not found third packages in " + antDesignName + "!");
            throw Error();
        }
    }
    catch (e) {
        installAntd();
    }
    var localeDir = path.resolve(antDesignName, config_1.config.localePath);
    var files = fs.readdirSync(localeDir).map(function (file) { return path.resolve(localeDir, file); });
    // const files = [path.resolve(antDesignName, config.localePath, 'en_US.tsx')];
    var program = ts.createProgram({
        rootNames: files,
        options: {
            target: ts.ScriptTarget.ES2019,
            module: ts.ModuleKind.CommonJS
        }
    });
    for (var _i = 0, _a = program.getSourceFiles(); _i < _a.length; _i++) {
        var file = _a[_i];
        if (!file.isDeclarationFile) {
            var newText = getFileExportDefaultText(file);
            var destPath = path.resolve(config_1.config.dest.path, path.basename(file.fileName, config_1.config.extension) + config_1.config.dest.extension);
            var jsonText = 'export default ' + JSON.stringify(eval('(' + newText + ')'), null, 2);
            fs.writeFileSync(destPath, jsonText);
            logger.success("Generate " + destPath);
        }
    }
}
exports.main = main;
function isThirdPackageInstalled(packages) {
    return packages.length > 0 && packages.every(function (p) { return fs.readdirSync(path.resolve(antDesignName, 'node_modules', p)).length > 0; });
}
function installAntd() {
    logger.info("Deleting " + antDesignName + ".");
    child_process_1.execSync("rm -rf " + antDesignName);
    logger.info("Downloading " + antDesignName + " " + config_1.config.tag + " version...");
    child_process_1.execSync("git clone https://github.com/ant-design/ant-design.git --branch " + config_1.config.tag + " --depth=1\n ");
    logger.info("Installing " + thirdPackages + "...");
    child_process_1.execSync("cd " + antDesignName + " && npm install " + thirdPackages.join(' '));
}
function getFileExportDefaultText(file) {
    var replacementObj = getExportDefaultText(file);
    var exportStart = replacementObj.exportStart, exportEnd = replacementObj.exportEnd, replaceInputs = replacementObj.replaceInputs;
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
function getExportDefaultText(file) {
    var _a;
    var replaceInputs = [];
    var variableObj = {};
    var exportObj = {};
    var importObj = {};
    var exportDefaultName = '';
    var exportStart = 0;
    var exportEnd = 0;
    var _loop_1 = function (statement) {
        var _a, _b;
        if (ts.isImportDeclaration(statement)) {
            var importClause = statement.importClause;
            var importName = [];
            // import <-A-> from 'B';
            if (importClause === null || importClause === void 0 ? void 0 : importClause.name) {
                importName = [importClause === null || importClause === void 0 ? void 0 : importClause.name.getText(file)];
                // import <-{ A, C }-> from 'B';
            }
            else if (importClause === null || importClause === void 0 ? void 0 : importClause.namedBindings) {
                // @ts-ignore
                importName = importClause === null || importClause === void 0 ? void 0 : importClause.namedBindings.elements.map(function (e) { return e.name.text; });
            }
            // import A from '<-B->';
            var moduleSpecifier_1 = statement.moduleSpecifier.text;
            importName.forEach(function (name) { return (importObj[name] = moduleSpecifier_1); });
            return "continue";
        }
        if (statement.kind === ts.SyntaxKind.ExportAssignment) {
            exportDefaultName = statement.expression.getText(file);
            exportObj[exportDefaultName] = {
                node: statement.expression
            };
        }
        // const a = 'a';
        if (statement.kind === ts.SyntaxKind.VariableStatement) {
            var initializer = statement.declarationList.declarations[0].initializer;
            var variableName = statement.declarationList.declarations[0].name.getText(file);
            variableObj[variableName] = { node: initializer };
        }
        // export default a
        if (ts.isExpressionStatement(statement) && getExportsDefaultExpression(statement.expression)) {
            var exportDefaultExpression = getExportsDefaultExpression(statement.expression);
            exportDefaultName = exportDefaultExpression.getText(file);
            var result = (_a = {},
                _a[exportDefaultName] = {
                    node: exportDefaultExpression
                },
                _a);
            /**
             * find variable, make sure value is real value. e.g.
             * var local = {};
             * var _default = locale;
             * exports.default = _default;
             */
            while (ts.isIdentifier((_a = variableObj[exportDefaultName]) === null || _a === void 0 ? void 0 : _a.node)) {
                exportDefaultName = variableObj[exportDefaultName].node.getText(file);
                result = (_b = {}, _b[exportDefaultName] = variableObj[exportDefaultName], _b);
            }
            Object.assign(exportObj, result);
        }
    };
    for (var _i = 0, _b = file.statements; _i < _b.length; _i++) {
        var statement = _b[_i];
        _loop_1(statement);
    }
    /**
     * import a from 'B';
     * export default a
     */
    if (importObj[exportDefaultName]) {
        var node = exportObj[exportDefaultName].node;
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
    }
    else if (variableObj[exportDefaultName]) {
        var node = variableObj[exportDefaultName].node;
        exportStart = node.pos;
        exportEnd = node.end;
        visitObjectProperty(node);
    }
    return {
        exportStart: exportStart,
        exportEnd: exportEnd,
        replaceInputs: replaceInputs
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
    function visitObjectProperty(node) {
        var _a;
        var initialText = '';
        var initializer = (_a = node) === null || _a === void 0 ? void 0 : _a.initializer;
        if (initializer && ts.isObjectLiteralExpression(initializer)) {
            initializer.properties.forEach(function (p) { return visitObjectProperty(p); });
            return;
        }
        else if (ts.isObjectLiteralExpression(node)) {
            node.properties.forEach(function (p) { return visitObjectProperty(p); });
            return;
        }
        else if (ts.isSpreadAssignment(node)) {
            initialText = node.expression.getText(file);
        }
        else if (ts.isShorthandPropertyAssignment(node)) {
            initialText = node.name.text;
        }
        else if (ts.isPropertyAssignment(node)) {
            initialText = node.initializer.text;
        }
        else {
            initialText = node.getText(file);
        }
        if (importObj[initialText]) {
            visitModule(initialText, node, file, importObj, replaceInputs);
        }
        else if (variableObj[initialText]) {
            var newNode = variableObj[initialText].node;
            if (ts.isObjectLiteralExpression(newNode)) {
                visitObjectProperty(newNode);
            }
            replaceInputs.push({
                pos: node.pos,
                end: node.end,
                replacementText: node.name.getText(file) + ": " + newNode.getText(file)
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
function getReplacedExportText(sourceFile, exportValueStart, exportValueEnd, replacements) {
    var fileText = sourceFile.getFullText();
    var newExportDefaultText = fileText.substring(exportValueStart, exportValueEnd);
    for (var _i = 0, _a = replacements.reverse(); _i < _a.length; _i++) {
        var _b = _a[_i], pos = _b.pos, end = _b.end, replacementText = _b.replacementText;
        newExportDefaultText =
            newExportDefaultText.slice(0, pos - exportValueStart) + replacementText + newExportDefaultText.slice(end - exportValueStart);
    }
    return newExportDefaultText;
}
/**
 * if expression is "exports.default = xxx"
 * @param expression
 */
function getExportsDefaultExpression(expression) {
    var _a;
    var left = expression.left;
    var right = expression.right;
    if (((_a = left === null || left === void 0 ? void 0 : left.expression) === null || _a === void 0 ? void 0 : _a.text) === 'exports' && left.name.text === 'default' && !!right.text) {
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
function visitModule(name, node, sourceFile, importInfo, replaceInputs) {
    var thirdPackage = config_1.config.thirdPackage[name];
    var realPath, replacementText;
    if (thirdPackage) {
        realPath = path.resolve(antDesignName, 'node_modules', importInfo[name] + thirdPackage.extension);
    }
    else {
        realPath = path.resolve(sourceFile.fileName, '../', importInfo[name] + config_1.config.extension);
    }
    var file = ts.createSourceFile(realPath, fs.readFileSync(realPath).toString(), ts.ScriptTarget.ES2019);
    var moduleText = getFileExportDefaultText(file);
    if (ts.isSpreadAssignment(node)) {
        // replace first "{" and last "," "}" to null
        replacementText = moduleText.replace(/^[^{]*{|(,\s)*}[^}]*$/g, '');
    }
    else if (ts.isShorthandPropertyAssignment(node)) {
        replacementText = name + ":" + moduleText;
    }
    else {
        replacementText = moduleText;
    }
    replaceInputs.push({
        pos: node.pos,
        end: node.end,
        replacementText: replacementText
    });
}
