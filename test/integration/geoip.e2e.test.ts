import { GenericContainer, StartedTestContainer } from "testcontainers";
import { RedisClient, redisClient } from "../../src/services/redis-client"; // Update this line to include redisClient
import { GeoService } from "../../src/services/geo-service";
import { IpUtil } from "../../src/services/ip-util"; // Add this import
import { setupTestData } from "../fixtures/redis-fixture";
import { app } from "../../src/app";
import request from "supertest";
import dotenv from "dotenv";

describe("GeoIP Service E2E Tests", () => {
  let redisContainer: StartedTestContainer;
  let redisPort: number;
  let originalRedisPort: string | undefined;
  let originalRedisHost: string | undefined;

  // Spin up Redis container before all tests
  beforeAll(async () => {
    console.log("Starting Redis test container with random port...");

    // Save original env vars
    originalRedisPort = process.env.REDIS_PORT;
    originalRedisHost = process.env.REDIS_HOST;

    try {
      // Start Redis container with a random port
      redisContainer = await new GenericContainer("redis:7")
        .withExposedPorts(6379)
        .withStartupTimeout(120000) // 2 minutes timeout for container startup
        .start();

      // Get the mapped port (random port assigned by Docker)
      redisPort = redisContainer.getMappedPort(6379);
      const redisHost = redisContainer.getHost();

      console.log(`Redis test container assigned to ${redisHost}:${redisPort}`);

      // Update environment variables for this test run
      process.env.REDIS_PORT = redisPort.toString();
      process.env.REDIS_HOST = redisHost;

      // Allow some time for the container to properly initialize
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Completely reset Redis client to pick up new config
      await RedisClient.resetInstance();

      // Wait a bit more after reset to ensure connection is ready
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Load test data
      await setupTestData();
    } catch (error) {
      console.error(
        "Failed to start Redis container or load test data:",
        error
      );

      // Try to clean up if container was started
      if (redisContainer) {
        try {
          await redisContainer.stop();
        } catch (cleanupError) {
          console.error(
            "Error stopping container during error cleanup:",
            cleanupError
          );
        }
      }

      throw error;
    }
  }, 120000); // Increased timeout for container startup and setup

  // Clean up after tests
  afterAll(async () => {
    try {
      // Restore original env vars
      if (originalRedisPort) process.env.REDIS_PORT = originalRedisPort;
      if (originalRedisHost) process.env.REDIS_HOST = originalRedisHost;

      // Properly close the Redis connection before resetting
      const redisClient = RedisClient.getInstance();
      await redisClient.disconnect();

      // Reset Redis client to pick up original environment
      await RedisClient.resetInstance();

      // Stop and remove the container
      if (redisContainer) {
        await redisContainer.stop();
        console.log("Redis test container stopped and removed");
      }
    } catch (error) {
      console.error("Error during test cleanup:", error);
    }
  }, 15000); // Increased timeout for cleanup

  describe("GeoService Direct Tests", () => {
    it("should return geolocation data for a known IPv4", async () => {
      // Using a known test IPv4 that should be in our fixture
      const result = await GeoService.lookupIp("192.168.1.1");

      expect(result).not.toBeNull();
      expect(result?.countryCode).toBe("US");
      expect(result?.state).toBe("California");
      expect(result?.city).toBe("San Francisco");
      expect(result?.ipVersion).toBe(4);
    });

    it("should return null for an unknown IPv4", async () => {
      const result = await GeoService.lookupIp("8.8.4.4"); // Not in our test data
      expect(result).toBeNull();
    });

    it("should return geolocation data for a known IPv6", async () => {
      // Using a known test IPv6 that should be in our fixture
      const result = await GeoService.lookupIp("2001:db8::1");

      expect(result).not.toBeNull();
      expect(result?.countryCode).toBe("JP");
      expect(result?.state).toBe("Tokyo");
      expect(result?.city).toBe("Tokyo");
      expect(result?.ipVersion).toBe(6);
    });

    it("should return null for an unknown IPv6", async () => {
      const result = await GeoService.lookupIp("2001:db8:1234::1"); // Not in our test data
      expect(result).toBeNull();
    });
  });

  describe("API Controller Tests", () => {
    it("should return 200 and geolocation data for a known IPv4", async () => {
      const response = await request(app)
        .get("/api/geo")
        .query({ ip: "192.168.1.1" });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("countryCode", "US");
      expect(response.body).toHaveProperty("state", "California");
      expect(response.body).toHaveProperty("city", "San Francisco");
      expect(response.body).toHaveProperty("ipVersion", 4);
    });

    it("should return 404 for an unknown IPv4", async () => {
      const response = await request(app)
        .get("/api/geo")
        .query({ ip: "8.8.4.4" }); // Not in test data

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty(
        "message",
        "No geolocation data found for the provided IP address"
      );
    });

    it("should return 200 and geolocation data for a known IPv6", async () => {
      const response = await request(app)
        .get("/api/geo")
        .query({ ip: "2001:db8::1" });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("countryCode", "JP");
      expect(response.body).toHaveProperty("state", "Tokyo");
      expect(response.body).toHaveProperty("city", "Tokyo");
      expect(response.body).toHaveProperty("ipVersion", 6);
    });

    it("should return 404 for an unknown IPv6", async () => {
      const response = await request(app)
        .get("/api/geo")
        .query({ ip: "2001:db8:1234::1" }); // Not in test data

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty(
        "message",
        "No geolocation data found for the provided IP address"
      );
    });

    it("should return 400 for invalid IP address", async () => {
      const response = await request(app)
        .get("/api/geo")
        .query({ ip: "not-an-ip" });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty(
        "error",
        "Invalid IP address format"
      );
    });

    it("should return 400 when IP is missing", async () => {
      const response = await request(app).get("/api/geo");

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty(
        "error",
        "Missing required query parameter: ip"
      );
    });
  });

  // Add this test to debug IPv6 issues
  describe("Debug tests", () => {
    it("should verify IPv6 test data in Redis", async () => {
      console.log("Debugging IPv6 test data in Redis");

      // Direct check in Redis for the test IPv6 address
      const testIp = "2001:db8::1";
      const ipBigInt = IpUtil.ipv6ToBigInt(testIp);
      console.log(`Test IPv6: ${testIp} as BigInt: ${ipBigInt}`);

      // Search for geoip:v6:range:* keys in Redis
      const client = redisClient.client;
      const scanResult = await client.scan(0, {
        MATCH: "geoip:v6:range:*",
        COUNT: 1000,
      });

      console.log(`Found ${scanResult.keys.length} IPv6 range keys in Redis`);

      // Check each key to see if the test IP falls within any range
      let found = false;
      for (const key of scanResult.keys) {
        const parts = key.split(":");
        if (parts.length >= 5) {
          const startBigInt = BigInt(parts[3]);
          const endBigInt = BigInt(parts[4]);

          console.log(`Checking range ${key}: ${startBigInt} - ${endBigInt}`);

          if (ipBigInt >= startBigInt && ipBigInt <= endBigInt) {
            const data = await redisClient.hGetAll(key);
            console.log(`Found matching range for ${testIp}: ${key}`);
            console.log(`Data:`, data);
            found = true;

            // This should pass if the data is correctly loaded
            expect(data).toHaveProperty("countryCode", "JP");
            expect(data).toHaveProperty("state", "Tokyo");
            expect(data).toHaveProperty("city", "Tokyo");
          }
        }
      }

      // This expectation helps us confirm we found a match
      expect(found).toBe(true);
    });
  });
});
