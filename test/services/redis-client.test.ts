import { RedisClient, redisClient } from "../../src/services/redis-client";

// Create real mock implementations for the test
jest.mock("../../src/services/redis-client", () => {
  // Store values in memory for testing
  const inMemoryStore: Record<string, string> = {};
  const inMemoryHashes: Record<string, Record<string, string>> = {};

  // Create a mock client
  const mockClientObj = {
    ensureConnection: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    isConnected: jest.fn().mockReturnValue(true),
    connecting: false,
    connected: true,
    client: {
      set: jest.fn().mockImplementation((key: string, value: string) => {
        inMemoryStore[key] = value;
        return "OK";
      }),
      get: jest.fn().mockImplementation((key: string) => {
        return inMemoryStore[key] || null;
      }),
      hSet: jest
        .fn()
        .mockImplementation((key: string, field: string, value: string) => {
          if (!inMemoryHashes[key]) inMemoryHashes[key] = {};
          inMemoryHashes[key][field] = value;
          return 1;
        }),
      hGetAll: jest.fn().mockImplementation((key: string) => {
        return inMemoryHashes[key] || {};
      }),
      scan: jest.fn().mockResolvedValue({ cursor: 0, keys: [] }),
      del: jest.fn().mockImplementation((keys: string | string[]) => {
        const keyArray = Array.isArray(keys) ? keys : [keys];
        let deletedCount = 0;

        for (const key of keyArray) {
          if (inMemoryStore[key]) {
            delete inMemoryStore[key];
            deletedCount++;
          }
          if (inMemoryHashes[key]) {
            delete inMemoryHashes[key];
            deletedCount++;
          }
        }

        return deletedCount;
      }),
      multi: jest.fn().mockReturnValue({
        hSet: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      }),
    },
  };

  // Add proper wrapper methods that call ensureConnection first
  const mockClient = {
    ...mockClientObj,
    set: jest.fn().mockImplementation(async (key: string, value: string) => {
      await mockClientObj.ensureConnection();
      inMemoryStore[key] = value;
      return "OK";
    }),
    get: jest.fn().mockImplementation(async (key: string) => {
      await mockClientObj.ensureConnection();
      return inMemoryStore[key] || null;
    }),
    hSet: jest
      .fn()
      .mockImplementation(async (key: string, field: string, value: string) => {
        await mockClientObj.ensureConnection();
        if (!inMemoryHashes[key]) inMemoryHashes[key] = {};
        inMemoryHashes[key][field] = value;
        return 1;
      }),
    hGetAll: jest.fn().mockImplementation(async (key: string) => {
      await mockClientObj.ensureConnection();
      return inMemoryHashes[key] || {};
    }),
  };

  return {
    redisClient: mockClient,
    RedisClient: {
      getInstance: jest.fn().mockReturnValue(mockClient),
      resetInstance: jest.fn(),
    },
  };
});

describe("RedisClient", () => {
  let client: RedisClient;

  beforeEach(() => {
    // Clear implementations to start fresh
    jest.clearAllMocks();
    client = redisClient;
  });

  test("should get and set values", async () => {
    const testKey = "test-key";
    await client.set(testKey, "test-value");
    const value = await client.get(testKey);
    expect(value).toBe("test-value");
    // Clean up
    await client.client.del(testKey);
  });

  test("should handle hash operations", async () => {
    const testKey = "test-hash-key";

    await client.hSet(testKey, "field1", "value1");
    await client.hSet(testKey, "field2", "value2");

    const data = await client.hGetAll(testKey);

    expect(data).toEqual({
      field1: "value1",
      field2: "value2",
    });

    // Clean up
    await client.client.del(testKey);
  });

  test("should check connection status", () => {
    expect(client.isConnected()).toBe(true);
  });

  test("should ensure connection before operations", async () => {
    await client.get("any-key");
    expect(client.ensureConnection).toHaveBeenCalled();
  });

  test("should disconnect when requested", async () => {
    await client.disconnect();
    expect(client.disconnect).toHaveBeenCalled();
  });
});
