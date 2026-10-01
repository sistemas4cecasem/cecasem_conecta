export default {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test/setup-unit-environment.ts'],
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  testMatch: ['<rootDir>/src/**/*.spec.ts', '<rootDir>/test/**/*.e2e-spec.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  clearMocks: true,
  restoreMocks: true,
};
