#!/usr/bin/env node

/**
 * Script to test direct IP lookup in Redis
 */
const { createClient } = require("redis");

// Read command-line arguments
const ip = process.argv[2];
if (!ip) {
  console.error("Usage: node test-ip-lookup.js <ip-address>");
  console.error("Example: node test-ip-lookup.js 149.101.100.1");
  process.exit(1);
}

// IP utility functions
function ipToLong(ip) {
  return (
    ip
      .split(".")
      .reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0
  );
}

function longToIp(long) {
  return [
    (long >>> 24) & 255,
    (long >>> 16) & 255,
    (long >>> 8) & 255,
    long & 255,
  ].join(".");
}

// Function to convert between signed and unsigned representations
function toSigned32(n) {
  // Convert unsigned to signed if necessary
  return n > 0x7fffffff ? n - 0x100000000 : n;
}

function toUnsigned32(n) {
  // Convert signed to unsigned if necessary
  return n < 0 ? n + 0x100000000 : n;
}

// Create Redis client
const redisClient = createClient({
  url: `redis://${process.env.REDIS_HOST || "localhost"}:${
    process.env.REDIS_PORT || 6379
  }`,
});

async function lookupIp(ip) {
  try {
    console.log(`Looking up IP address: ${ip}`);

    // Connect to Redis
    await redisClient.connect();
    console.log("Connected to Redis");

    // Convert IP to numeric form
    const ipLong = ipToLong(ip);
    const ipLongSigned = toSigned32(ipLong);

    console.log(`IP ${ip} converted to unsigned numeric: ${ipLong}`);
    console.log(`IP ${ip} converted to signed numeric: ${ipLongSigned}`);

    // Try direct index lookup first
    const exactIndexKey = `geoip:v4:idx:${ipLongSigned}`;
    console.log(`Checking exact index key: ${exactIndexKey}`);
    const exactRangeKey = await redisClient.get(exactIndexKey);

    if (exactRangeKey) {
      console.log(`Found exact match: ${exactRangeKey}`);
      const data = await redisClient.hGetAll(exactRangeKey);
      console.log("Data:", data);
      return;
    }

    // Scan all range keys to find a matching range
    console.log("No exact match, scanning all ranges...");

    let cursor = 0;
    let rangesChecked = 0;
    let found = false;

    do {
      const result = await redisClient.scan(cursor, {
        MATCH: "geoip:v4:range:*",
        COUNT: 1000,
      });

      cursor = result.cursor;
      rangesChecked += result.keys.length;

      for (const key of result.keys) {
        // Print each key for debugging
        console.log(`Checking range key: ${key}`);

        // Keys are in the format: geoip:v4:range:{startIp}:{endIp}
        const parts = key.split(":");
        if (parts.length < 5) continue;

        const startIpLong = parseInt(parts[3], 10);
        const endIpLong = parseInt(parts[4], 10);

        // Convert start/end to their unsigned equivalents for fair comparison
        const startIpUnsigned = toUnsigned32(startIpLong);
        const endIpUnsigned = toUnsigned32(endIpLong);

        console.log(`Range bounds: ${startIpLong} to ${endIpLong} (signed)`);
        console.log(
          `Range bounds: ${startIpUnsigned} to ${endIpUnsigned} (unsigned)`
        );
        console.log(`IP numeric value: ${ipLong} (unsigned)`);

        // Get the IP addresses for human readability
        const startIpStr = longToIp(startIpUnsigned);
        const endIpStr = longToIp(endIpUnsigned);
        console.log(`Range IP addresses: ${startIpStr} to ${endIpStr}`);

        // Check if the IP falls within this range (using unsigned for comparison)
        if (ipLong >= startIpUnsigned && ipLong <= endIpUnsigned) {
          console.log(`Found matching range: ${key} for ${ip} (${ipLong})`);
          console.log(`Range: ${startIpStr} to ${endIpStr}`);

          const data = await redisClient.hGetAll(key);
          console.log("Data:", data);

          found = true;
          break;
        }
      }

      // Give periodic progress updates
      if (rangesChecked % 5000 === 0 && !found) {
        console.log(`Checked ${rangesChecked} ranges so far...`);
      }
    } while (cursor !== 0 && !found);

    if (!found) {
      console.log(
        `No matching range found for ${ip} after checking ${rangesChecked} ranges`
      );
    }
  } catch (error) {
    console.error("Error looking up IP:", error);
  } finally {
    await redisClient.quit();
    console.log("Redis connection closed");
  }
}

lookupIp(ip).catch(console.error);
