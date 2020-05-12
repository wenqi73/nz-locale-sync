# nz-locale-sync
Synchronize the locale files from [ant-design locale directory](https://github.com/ant-design/ant-design/tree/master/components/locale)

## How to use
- Clone [ant-design](https://github.com/ant-design/ant-design.git) and install
- Clone this repo and install.
- Change `importReflect` in index.ts, default as follow
```ts
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

```
- Run `npm run start`
