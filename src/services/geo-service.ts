import { redisClient } from "./redis-client";
import { IpUtil } from "./ip-util";
import { GeoLookupResult } from "../models/geo-data";

export class GeoService {
  /**
   * Look up geolocation data for a given IP address
   */
  static async lookupIp(ip: string): Promise<GeoLookupResult | null> {
    try {
      // Determine IP version
      const ipVersion = IpUtil.getIpVersion(ip);

      if (!ipVersion) {
        throw new Error(`Invalid IP address format: ${ip}`);
      }

      // Handle different IP versions
      if (ipVersion === 4) {
        return await this.lookupIpv4(ip);
      } else {
        return await this.lookupIpv6(ip);
      }
    } catch (error) {
      console.error("Error looking up IP:", error);
      return null;
    }
  }

  /**
   * Look up IPv4 geolocation data
   */
  private static async lookupIpv4(ip: string): Promise<GeoLookupResult | null> {
    const ipLong = IpUtil.ipToLong(ip);

    // First, try to find an exact match
    const exactMatchKey = `geoip:v4:${ip}`;
    const exactMatch = await redisClient.hGetAll(exactMatchKey);

    if (exactMatch && Object.keys(exactMatch).length > 0) {
      return {
        ip,
        ipVersion: 4,
        countryCode: exactMatch.countryCode || null,
        state: exactMatch.state || null,
        city: exactMatch.city || null,
      };
    }

    // If no exact match, look up range that includes this IP
    const rangeKeys = await this.findIpv4RangeKeys(ipLong);

    if (rangeKeys.length === 0) {
      // Debug logging
      console.log(`No range keys found for IP ${ip} (${ipLong})`);
      return null;
    }

    // Get data from the first matching range
    const data = await redisClient.hGetAll(rangeKeys[0]);

    return {
      ip,
      ipVersion: 4,
      countryCode: data.countryCode || null,
      state: data.state || null,
      city: data.city || null,
    };
  }

  /**
   * Look up IPv6 geolocation data
   */
  private static async lookupIpv6(ip: string): Promise<GeoLookupResult | null> {
    try {
      const ipBigInt = IpUtil.ipv6ToBigInt(ip);

      // First, try to find an exact match
      const exactMatchKey = `geoip:v6:${ip}`;
      const exactMatch = await redisClient.hGetAll(exactMatchKey);

      if (exactMatch && Object.keys(exactMatch).length > 0) {
        return {
          ip,
          ipVersion: 6,
          countryCode: exactMatch.countryCode || null,
          state: exactMatch.state || null,
          city: exactMatch.city || null,
        };
      }

      // If no exact match, look up range that includes this IP
      const rangeKeys = await this.findIpv6RangeKeys(ipBigInt);

      if (rangeKeys.length === 0) {
        return null;
      }

      // Get data from the first matching range
      const data = await redisClient.hGetAll(rangeKeys[0]);

      return {
        ip,
        ipVersion: 6,
        countryCode: data.countryCode || null,
        state: data.state || null,
        city: data.city || null,
      };
    } catch (error) {
      console.error("Error in IPv6 lookup:", error);
      return null;
    }
  }

  /**
   * Find Redis keys containing IPv4 ranges that include the given IP
   * This implementation now scans Redis for all range keys and checks if the IP falls within any range
   */
  private static async findIpv4RangeKeys(ipLong: number): Promise<string[]> {
    try {
      const matchingKeys = [];
      let cursor = 0;

      // Direct access to Redis client for scan operation
      const client = redisClient.client;

      do {
        // Updated scan operation for Redis client v4
        const scanResult = await client.scan(cursor, {
          MATCH: "geoip:v4:range:*",
          COUNT: 1000,
        });

        cursor = scanResult.cursor;
        const keys = scanResult.keys;

        // Check each key to see if the IP falls within the range
        for (const key of keys) {
          const parts = key.split(":");
          if (parts.length >= 5) {
            const startLong = parseInt(parts[3], 10);
            const endLong = parseInt(parts[4], 10);

            if (ipLong >= startLong && ipLong <= endLong) {
              matchingKeys.push(key);

              // For debugging
              console.log(
                `Found matching range for ${ipLong}: ${startLong}-${endLong} (${key})`
              );
            }
          }
        }

        // If we found any matches, we can stop scanning
        if (matchingKeys.length > 0) {
          break;
        }
      } while (cursor !== 0);

      return matchingKeys;
    } catch (error) {
      console.error("Error finding IPv4 range keys:", error);
      return [];
    }
  }

  /**
   * Find Redis keys containing IPv6 ranges that include the given IP
   * This implementation now properly scans Redis for IPv6 ranges
   */
  private static async findIpv6RangeKeys(ipBigInt: bigint): Promise<string[]> {
    try {
      const matchingKeys = [];
      let cursor = 0;

      // Direct access to Redis client for scan operation
      const client = redisClient.client;

      do {
        // Updated scan operation for Redis client v4
        const scanResult = await client.scan(cursor, {
          MATCH: "geoip:v6:range:*",
          COUNT: 1000,
        });

        cursor = scanResult.cursor;
        const keys = scanResult.keys;

        // Check each key to see if the IP falls within the range
        for (const key of keys) {
          const parts = key.split(":");
          if (parts.length >= 5) {
            // In geoip:v6:range:startBigInt:endBigInt, parts[3] is startBigInt and parts[4] is endBigInt
            try {
              const startBigInt = BigInt(parts[3]);
              const endBigInt = BigInt(parts[4]);

              if (ipBigInt >= startBigInt && ipBigInt <= endBigInt) {
                matchingKeys.push(key);

                // For debugging
                console.log(
                  `Found matching IPv6 range for ${ipBigInt}: ${startBigInt}-${endBigInt} (${key})`
                );
              }
            } catch (e) {
              console.error(`Error parsing BigInt from key ${key}:`, e);
            }
          }
        }

        // If we found any matches, we can stop scanning
        if (matchingKeys.length > 0) {
          break;
        }
      } while (cursor !== 0);

      return matchingKeys;
    } catch (error) {
      console.error("Error finding IPv6 range keys:", error);
      return [];
    }
  }
}
