"use strict";
exports.__esModule = true;
exports.error = exports.info = exports.warning = exports.success = void 0;
function success(value) {
    console.log('\x1b[32m%s\x1b[0m', value);
}
exports.success = success;
function warning(value) {
    console.log('\x1b[33m%s\x1b[0m', value);
}
exports.warning = warning;
function info(value) {
    console.log('\x1b[34m%s\x1b[0m', value);
}
exports.info = info;
function error(value) {
    console.log('\x1b[31m%s\x1b[0m', value);
}
exports.error = error;
