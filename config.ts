export const config = {
    // ant-design i18n path
    localePath: 'components/locale/',

    tag: '4.2.2',

    // ant-design i18n file extension
    extension: '.tsx',

    /**
     * third package, such as following line
     * in ant-design/components/locale/default.tsx
     * `import Pagination from 'rc-pagination/lib/locale`/en_US';
     */
    thirdPackage: {
        Pagination: {
            name: 'rc-pagination',
            extension: '.js'
        },
        CalendarLocale: {
            name: 'rc-picker',
            extension: '.js'
        }
    },

    // target path
    dest: {
        path: `${__dirname}/../ng-zorro-antd/components/i18n/languages`,
        extension: '.ts'
    }
};
