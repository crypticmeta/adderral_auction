/* File: backend/jest.config.ts | Purpose: Jest configuration for backend TypeScript tests */
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/src/tests/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  clearMocks: true,
  verbose: false,
  // Resolve TS paths simply within backend/src
  moduleDirectories: ['node_modules', '<rootDir>/src'],
  // Use real Postgres and Redis via Testcontainers
  globalSetup: '<rootDir>/src/tests/setup/testcontainers.setup.ts',
  globalTeardown: '<rootDir>/src/tests/setup/testcontainers.teardown.ts',
  setupFilesAfterEnv: ['<rootDir>/src/tests/setup/jest.setup.ts'],
};

export default config;
