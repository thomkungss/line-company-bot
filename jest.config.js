/** @type {import('jest').Config} */
module.exports = {
    testEnvironment: 'node',
    roots: [
        '<rootDir>/packages/shared/src',
        '<rootDir>/packages/line-bot/src',
        '<rootDir>/packages/admin-web/src',
    ],
    testMatch: ['**/__tests__/**/*.test.ts'],
    moduleNameMapper: {
        '^@company-bot/shared$': '<rootDir>/packages/shared/src',
    },
    transform: {
        '^.+\\.ts$': ['@swc/jest', {
            jsc: {
                parser: {
                    syntax: 'typescript',
                    decorators: true,
                },
                target: 'es2022',
            },
            module: {
                type: 'commonjs',
            },
        }],
    },
    clearMocks: true,
    testTimeout: 10000,
};
