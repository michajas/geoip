import { RedisClient } from "../src/services/redis-client";

// Reset Redis singleton after all tests
afterAll(async () => {
  // Disconnect any Redis clients
  await RedisClient.resetInstance();
});

// Increase timeout for all tests
jest.setTimeout(30000);

// Silence console logs during tests
beforeAll(() => {
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;

  global.console.log = (...args) => {
    if (process.env.DEBUG) {
      originalConsoleLog(...args);
    }
  };

  global.console.error = (...args) => {
    // Always show errors
    originalConsoleError(...args);
  };
});
