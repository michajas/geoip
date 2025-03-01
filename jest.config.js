module.exports = {
  testEnvironment: "node",
  transform: {
    "^.+\\.ts$": ["@swc/jest"],
  },
  moduleFileExtensions: ["js", "ts", "json", "node"],
  testMatch: ["**/__tests__/**/*.[jt]s?(x)", "**/?(*.)+(spec|test).[jt]s?(x)"],
  coverageDirectory: "coverage",
  coverageProvider: "v8",
  collectCoverageFrom: [
    "src/**/*.[jt]s?(x)",
    "!src/**/*.d.ts",
    "!src/**/*.test.[jt]s?(x)",
    "!src/**/__tests__/**",
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  setupFilesAfterEnv: [
    "./test/jest.setup.ts",
    "./test/jest-setup-serializer.js",
  ],
  testTimeout: 30000, // Increased timeout for the container tests
  // Add these settings for better handling of BigInt
  globals: {
    // Tell Jest how to handle BigInt serialization
    defaultTransformModules: [
      "@babel/runtime/helpers/esm/typeof",
      "jest-environment-node",
    ],
  },
  // Make jest work with ES modules
  transformIgnorePatterns: [
    "/node_modules/(?!(module-that-needs-to-be-transformed)/)",
  ],
};
