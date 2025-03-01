/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  setupFilesAfterEnv: [
    "<rootDir>/test/jest-bigint-setup.js", // Load this first to handle BigInt serialization
    "<rootDir>/test/jest.setup.ts",
  ],
  testMatch: ["**/test/**/*.test.ts"],
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/scripts/**/*",
    "!src/types/**/*",
    "!src/**/index.ts",
  ],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: "tsconfig.json",
        isolatedModules: false, // Disable isolated modules to handle BigInt
      },
    ],
  },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  transformIgnorePatterns: ["/node_modules/", "\\.pnp\\.[^\\/]+$"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  testTimeout: 30000,
};
