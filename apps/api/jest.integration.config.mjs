import base from './jest.config.mjs';

export default {
  ...base,
  setupFiles: [],
  testMatch: ['<rootDir>/test/**/*.integration-spec.ts'],
  testTimeout: 20000,
};
