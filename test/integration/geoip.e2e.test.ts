import supertest from "supertest";
import { GenericContainer, StartedTestContainer } from "testcontainers";
import { createTestApp, setupRedis, teardownRedis } from "../utils/test-app";
import { redisClient } from "../../src/services/redis-client";

describe("GeoIP API", () => {
  let redisContainer: StartedTestContainer;
  let redisPort: number;
  let app: any;
  let request: supertest.SuperTest<supertest.Test>;

  // Set up Redis container and app before all tests
  beforeAll(async () => {
    // Start Redis container for testing
    redisContainer = await new GenericContainer("redis:7.0")
      .withExposedPorts(6379)
      .start();

    // Get the mapped port (random port assigned by Docker)
    redisPort = redisContainer.getMappedPort(6379);
    const redisHost = redisContainer.getHost();

    console.log(`Redis test container assigned to ${redisHost}:${redisPort}`);

    // Override Redis client configuration to use Docker container
    process.env.REDIS_HOST = redisHost;
    process.env.REDIS_PORT = String(redisPort);

    // Create test data in Redis
    await setupRedis();
    await setupTestData();

    // Create Express app
    app = createTestApp();
    request = supertest(app);
  }, 60000); // Increase timeout for container startup

  // Clean up after all tests
  afterAll(async () => {
    // Clean up Redis test data
    await cleanupTestData();
    await teardownRedis();

    // Stop the Redis container
    if (redisContainer) {
      await redisContainer.stop();
    }
  }, 60000); // Increase timeout for container cleanup

  // Set up test data in Redis
  async function setupTestData() {
    // Sample IP range for testing
    const key = "geoip:v4:range:3232235776:3232235776"; // 192.168.1.0/32
    await redisClient.hSet(key, "countryCode", "US");
    await redisClient.hSet(key, "country", "United States");
    await redisClient.hSet(key, "state", "California");
    await redisClient.hSet(key, "city", "San Francisco");
    await redisClient.hSet(key, "startIp", "192.168.1.0");
    await redisClient.hSet(key, "endIp", "192.168.1.0");

    // Create index
    await redisClient.set("geoip:v4:idx:3232235776", key);
  }

  // Clean up test data from Redis
  async function cleanupTestData() {
    await redisClient.client.del("geoip:v4:range:3232235776:3232235776");
    await redisClient.client.del("geoip:v4:idx:3232235776");
  }

  // Tests
  it("should return health status", async () => {
    const res = await request.get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("status", "OK");
  });

  it("should return 400 when IP is not provided", async () => {
    const res = await request.get("/api/geo");
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("message", "IP address is required");
  });

  it("should return geo data for a valid IP", async () => {
    const res = await request.get("/api/geo?ip=192.168.1.0");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("ip", "192.168.1.0");
    expect(res.body).toHaveProperty("countryCode", "US");
    expect(res.body).toHaveProperty("country", "United States");
    expect(res.body).toHaveProperty("state", "California");
    expect(res.body).toHaveProperty("city", "San Francisco");
  });

  it("should return 404 for an IP with no data", async () => {
    const res = await request.get("/api/geo?ip=192.168.2.1");
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty(
      "message",
      "No geolocation data found for the provided IP address"
    );
  });
});
