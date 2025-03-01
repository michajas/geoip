import { RedisClient } from "../../src/services/redis-client";

describe("RedisClient", () => {
  let client: RedisClient;

  beforeAll(async () => {
    // Reset before all tests to ensure clean state
    await RedisClient.resetInstance();
    client = RedisClient.getInstance();
  });

  afterAll(async () => {
    await client.disconnect();
  });

  it("should connect to Redis", async () => {
    await client.ensureConnection();
    expect(client.isConnected()).toBe(true);
  });

  it("should get and set values", async () => {
    await client.ensureConnection();
    const testKey = "test:key:" + Date.now();
    await client.set(testKey, "test-value");
    const value = await client.get(testKey);
    expect(value).toBe("test-value");
    // Clean up
    await client.client.del(testKey);
  });

  it("should handle hash operations", async () => {
    await client.ensureConnection();
    const testKey = "test:hash:" + Date.now();
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
});
