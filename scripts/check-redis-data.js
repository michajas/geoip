#!/usr/bin/env node

/**
 * Script to verify GeoIP data was correctly imported to Redis
 */
const { createClient } = require("redis");

// Create Redis client
const redisClient = createClient({
  url: `redis://${process.env.REDIS_HOST || "localhost"}:${
    process.env.REDIS_PORT || 6379
  }`,
});

async function checkRedisData() {
  try {
    // Connect to Redis
    console.log("Connecting to Redis...");
    await redisClient.connect();
    console.log("Connected to Redis");

    // Check IPv4 data
    console.log("\nChecking IPv4 data...");
    let ipv4Count = 0;
    let cursor = 0;

    do {
      const result = await redisClient.scan(cursor, {
        MATCH: "geoip:v4:range:*",
        COUNT: 1000,
      });

      cursor = result.cursor;
      ipv4Count += result.keys.length;

      // Display sample data
      if (result.keys.length > 0 && ipv4Count <= 5) {
        const sampleKey = result.keys[0];
        const data = await redisClient.hGetAll(sampleKey);
        console.log(`Sample IPv4 range: ${sampleKey}`);
        console.log(data);
      }
    } while (cursor !== 0);

    console.log(`Found ${ipv4Count} IPv4 ranges in Redis`);

    // Check IPv6 data
    console.log("\nChecking IPv6 data...");
    let ipv6Count = 0;
    cursor = 0;

    do {
      const result = await redisClient.scan(cursor, {
        MATCH: "geoip:v6:range:*",
        COUNT: 1000,
      });

      cursor = result.cursor;
      ipv6Count += result.keys.length;

      // Display sample data
      if (result.keys.length > 0 && ipv6Count <= 5) {
        const sampleKey = result.keys[0];
        const data = await redisClient.hGetAll(sampleKey);
        console.log(`Sample IPv6 range: ${sampleKey}`);
        console.log(data);
      }
    } while (cursor !== 0);

    console.log(`Found ${ipv6Count} IPv6 ranges in Redis`);

    // Check IPv4 indexes
    console.log("\nChecking IPv4 indexes...");
    let ipv4IndexCount = 0;
    cursor = 0;

    do {
      const result = await redisClient.scan(cursor, {
        MATCH: "geoip:v4:idx:*",
        COUNT: 1000,
      });

      cursor = result.cursor;
      ipv4IndexCount += result.keys.length;
    } while (cursor !== 0);

    console.log(`Found ${ipv4IndexCount} IPv4 indexes in Redis`);

    // Summary
    console.log("\nSummary:");
    console.log(`Total GeoIP entries: ${ipv4Count + ipv6Count}`);
    console.log(`IPv4 ranges: ${ipv4Count}`);
    console.log(`IPv6 ranges: ${ipv6Count}`);
    console.log(`IPv4 indexes: ${ipv4IndexCount}`);

    // Test a specific lookup
    if (ipv4Count > 0) {
      console.log("\nTesting IPv4 lookup...");
      // Get the first IPv4 range in Redis
      const scanResult = await redisClient.scan(0, {
        MATCH: "geoip:v4:range:*",
        COUNT: 1,
      });

      if (scanResult.keys.length > 0) {
        const key = scanResult.keys[0];
        const data = await redisClient.hGetAll(key);
        console.log(`Range: ${key}`);
        console.log(`Start IP: ${data.startIp}, End IP: ${data.endIp}`);
        console.log(
          `Location: ${data.city}, ${data.state}, ${data.countryCode}`
        );
      }
    }
  } catch (error) {
    console.error("Error checking Redis data:", error);
  } finally {
    // Disconnect from Redis
    await redisClient.quit();
    console.log("\nDisconnected from Redis");
  }
}

// Run the check
checkRedisData().catch(console.error);
