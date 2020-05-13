export function success(value: string) {
    console.log('\x1b[32m%s\x1b[0m', value);
}

export function warning(value: string) {
    console.log('\x1b[33m%s\x1b[0m', value);
}

export function info(value: string) {
    console.log('\x1b[34m%s\x1b[0m', value);
}

export function error(value: string) {
    console.log('\x1b[31m%s\x1b[0m', value);
}
