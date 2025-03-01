/**
 * Jest setup file
 * This runs before each test file
 */

// Note: We don't need to mock the Redis client here anymore
// Each test file should handle its own mocking as needed

// Increase timeout for all tests
jest.setTimeout(30000);

// Handle console output during tests
const originalConsole = { ...console };
global.console = {
  ...console,
  // Only suppress error messages in tests, but keep the function
  error: jest.fn((...args) => {
    // Uncomment to see errors during tests
    // originalConsole.error(...args);
  }),
};
