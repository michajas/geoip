import { redisClient, RedisClient } from "../../src/services/redis-client";
import { IpUtil } from "../../src/services/ip-util";

/**
 * Test data for IPv4 ranges
 */
const ipv4TestData = [
  {
    startIp: "192.168.1.0",
    endIp: "192.168.1.255",
    countryCode: "US",
    state: "California",
    city: "San Francisco",
  },
  {
    startIp: "10.0.0.0",
    endIp: "10.0.0.255",
    countryCode: "UK",
    state: "England",
    city: "London",
  },
  {
    startIp: "172.16.0.0",
    endIp: "172.16.0.31",
    countryCode: "DE",
    state: "Berlin",
    city: "Berlin",
  },
];

/**
 * Test data for IPv6 ranges
 */
const ipv6TestData = [
  {
    startIp: "2001:db8::",
    endIp: "2001:db8::ffff",
    countryCode: "JP",
    state: "Tokyo",
    city: "Tokyo",
  },
  {
    startIp: "2001:4860::",
    endIp: "2001:4860::ffff",
    countryCode: "US",
    state: "California",
    city: "Mountain View",
  },
];

/**
 * Load test data into Redis
 */
export async function setupTestData(): Promise<void> {
  console.log("Setting up test data in Redis...");

  try {
    // Ensure connection is established before proceeding
    await redisClient.ensureConnection();

    // Verify connection is active
    try {
      const pingResponse = await redisClient.client.ping();
      console.log(`Redis connection check: ${pingResponse}`);
    } catch (error) {
      console.error("Redis ping failed, attempting to reconnect:", error);
      // Try to explicitly reconnect
      await redisClient.ensureConnection();
      // Verify again
      const pingResponse = await redisClient.client.ping();
      console.log(`Redis connection check after reconnect: ${pingResponse}`);
    }

    // First clear any existing data (in case previous tests failed cleanup)
    await clearExistingTestData();

    console.log("Loading IPv4 test data...");
    // Load IPv4 test data
    for (const data of ipv4TestData) {
      const startIpLong = IpUtil.ipToLong(data.startIp);
      const endIpLong = IpUtil.ipToLong(data.endIp);

      const key = `geoip:v4:range:${startIpLong}:${endIpLong}`;

      await redisClient.hSet(key, "startIp", data.startIp);
      await redisClient.hSet(key, "endIp", data.endIp);
      await redisClient.hSet(key, "countryCode", data.countryCode);
      await redisClient.hSet(key, "state", data.state);
      await redisClient.hSet(key, "city", data.city);

      // Create index for fast lookup
      await redisClient.set(`geoip:v4:idx:${startIpLong}`, key);
    }

    console.log("Loading IPv6 test data...");
    // Load IPv6 test data
    for (const data of ipv6TestData) {
      try {
        const startIpBigInt = IpUtil.ipv6ToBigInt(data.startIp);
        const endIpBigInt = IpUtil.ipv6ToBigInt(data.endIp);

        console.log(`IPv6 test data: ${data.startIp} to ${data.endIp}`);
        console.log(`Converted to BigInt: ${startIpBigInt} to ${endIpBigInt}`);

        const key = `geoip:v6:range:${startIpBigInt}:${endIpBigInt}`;

        await redisClient.hSet(key, "startIp", data.startIp);
        await redisClient.hSet(key, "endIp", data.endIp);
        await redisClient.hSet(key, "countryCode", data.countryCode);
        await redisClient.hSet(key, "state", data.state);
        await redisClient.hSet(key, "city", data.city);

        // Create index for fast lookup - convert BigInt to string for Redis key
        await redisClient.set(`geoip:v6:idx:${startIpBigInt.toString()}`, key);

        console.log(`Stored IPv6 data with key: ${key}`);

        // Test lookup for the first address in this range
        const testAddr = data.startIp;
        const testBigInt = IpUtil.ipv6ToBigInt(testAddr);
        console.log(
          `Verifying lookup with test address: ${testAddr} (${testBigInt})`
        );

        // Manually verify this IP is in our range
        if (testBigInt >= startIpBigInt && testBigInt <= endIpBigInt) {
          console.log(
            `Verified: ${testAddr} is in range ${data.startIp}-${data.endIp}`
          );
        } else {
          console.warn(
            `Warning: ${testAddr} is NOT in range ${data.startIp}-${data.endIp}`
          );
        }
      } catch (error) {
        console.error(
          `Error storing IPv6 test data for ${data.startIp}-${data.endIp}:`,
          error
        );
      }
    }

    console.log(
      `Successfully loaded ${ipv4TestData.length} IPv4 and ${ipv6TestData.length} IPv6 test records to Redis`
    );
  } catch (error) {
    console.error("Error setting up test data:", error);
    throw error;
  }
}

/**
 * Clear any existing test data from Redis
 */
async function clearExistingTestData(): Promise<void> {
  try {
    // Delete any existing keys that match our test patterns
    const patterns = ["geoip:v4:*", "geoip:v6:*"];

    await redisClient.ensureConnection();

    for (const pattern of patterns) {
      try {
        // Scan for keys matching the pattern and delete them
        let cursor = 0;
        do {
          // Scan for matching keys
          const scanResult = await redisClient.client.scan(cursor, {
            MATCH: pattern,
            COUNT: 1000,
          });

          cursor = scanResult.cursor;
          const keys = scanResult.keys;

          if (keys.length > 0) {
            // Delete the found keys
            await redisClient.client.del(keys);
            console.log(
              `Deleted ${keys.length} keys matching pattern ${pattern}`
            );
          }
        } while (cursor !== 0);
      } catch (error) {
        console.error(`Error cleaning up pattern ${pattern}:`, error);
      }
    }

    console.log("Cleared existing test data from Redis");
  } catch (error) {
    console.error("Error clearing existing test data:", error);
    // Continue anyway, as this is just cleanup
  }
}
