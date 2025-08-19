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
};

export default config;
