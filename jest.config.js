export default {
  projects: [
    {
      displayName: 'client',
      preset: 'ts-jest/presets/default-esm',
      testEnvironment: 'jsdom',
      roots: ['<rootDir>/apps/client/src/__tests__'],
      testMatch: ['**/*.test.ts', '**/*.test.tsx'],
      moduleNameMapper: {
        '^@shared/(.*)$': '<rootDir>/packages/shared/$1',
        '^@/(.*)$': '<rootDir>/apps/client/src/$1',
        '^(\\.{1,2}/.*)\\.js$': '$1'
      },
      extensionsToTreatAsEsm: ['.ts', '.tsx'],
      transform: {
        '^.+\\.tsx?$': ['ts-jest', {
          useESM: true,
          tsconfig: {
            jsx: 'react-jsx',
            module: 'ESNext',
            moduleResolution: 'node',
            esModuleInterop: true,
            allowSyntheticDefaultImports: true,
            skipLibCheck: true,
            strict: false,
            target: 'ES2020',
            types: ['jest', 'node', '@testing-library/jest-dom']
          }
        }]
      },
      moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
      setupFilesAfterEnv: ['<rootDir>/apps/client/src/__tests__/setup.ts'],
      testTimeout: 30000
    },
    {
      displayName: 'server',
      preset: 'ts-jest/presets/default-esm',
      testEnvironment: 'node',
      roots: ['<rootDir>/apps/server/__tests__'],
      testMatch: ['**/*.test.ts'],
      moduleNameMapper: {
        '^@shared/(.*)$': '<rootDir>/packages/shared/$1',
        '^(\\.{1,2}/.*)\\.js$': '$1'
      },
      extensionsToTreatAsEsm: ['.ts'],
      transform: {
        '^.+\\.tsx?$': ['ts-jest', {
          useESM: true,
          tsconfig: {
            module: 'ESNext',
            moduleResolution: 'node',
            esModuleInterop: true,
            allowSyntheticDefaultImports: true,
            skipLibCheck: true,
            strict: false,
            target: 'ES2020',
            types: ['jest', 'node']
          }
        }]
      },
      moduleFileExtensions: ['ts', 'js', 'json'],
      testTimeout: 30000
    },
    {
      displayName: 'legacy',
      preset: 'ts-jest/presets/default-esm',
      testEnvironment: 'node',
      roots: ['<rootDir>/tests'],
      testMatch: ['**/*.test.ts'],
      moduleNameMapper: {
        '^@shared/(.*)$': '<rootDir>/shared/$1',
        '^@client/(.*)$': '<rootDir>/client/src/$1',
        '^(\\.{1,2}/.*)\\.js$': '$1'
      },
      extensionsToTreatAsEsm: ['.ts'],
      transform: {
        '^.+\\.tsx?$': ['ts-jest', {
          useESM: true,
          tsconfig: {
            module: 'ESNext',
            moduleResolution: 'node',
            esModuleInterop: true,
            allowSyntheticDefaultImports: true,
            skipLibCheck: true,
            strict: false,
            target: 'ES2020',
            types: ['jest', 'node']
          }
        }]
      },
      moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
      testTimeout: 30000
    }
  ],
  collectCoverageFrom: [
    'apps/client/src/**/*.{ts,tsx}',
    'apps/server/**/*.ts',
    '!**/*.d.ts',
    '!**/node_modules/**'
  ],
  coverageDirectory: 'coverage',
  verbose: true
};
