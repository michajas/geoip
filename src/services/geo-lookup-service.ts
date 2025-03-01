import { redisClient } from "./redis-client";
import { IpUtil } from "./ip-util";
import { Ipv6Util } from "./ipv6-util";

export interface GeoIpLookupResult {
  ip: string;
  ipVersion: 4 | 6;
  countryCode?: string;
  country?: string;
  state?: string;
  city?: string;
  latitude?: string;
  longitude?: string;
}

export class GeoLookupService {
  /**
   * Look up geolocation data for an IP address
   */
  public async lookup(ip: string): Promise<GeoIpLookupResult | null> {
    // Validate the IP and determine its version
    const ipVersion = IpUtil.getIpVersion(ip);
    if (!ipVersion) {
      throw new Error(`Invalid IP address: ${ip}`);
    }

    // Ensure Redis connection
    await redisClient.ensureConnection();

    try {
      if (ipVersion === 4) {
        return await this.lookupIpv4(ip);
      } else {
        return await this.lookupIpv6(ip);
      }
    } catch (error) {
      console.error(`Error looking up IP ${ip}:`, error);
      return null;
    }
  }

  /**
   * Create a lookup result object from Redis data
   */
  private createLookupResult(
    ip: string,
    ipVersion: 4 | 6,
    data: Record<string, string>
  ): GeoIpLookupResult {
    return {
      ip,
      ipVersion,
      countryCode: data.countryCode,
      country: data.country,
      state: data.state,
      city: data.city,
      latitude: data.latitude,
      longitude: data.longitude,
    };
  }

  /**
   * Look up geolocation data for an IPv4 address
   */
  private async lookupIpv4(ip: string): Promise<GeoIpLookupResult | null> {
    const ipLong = IpUtil.ipToLong(ip);
    const ipLongSigned = IpUtil.toSigned32(ipLong);

    // Try direct index lookup first
    const exactIndexKey = `geoip:v4:idx:${ipLongSigned}`;
    const exactRangeKey = await redisClient.client.get(exactIndexKey);

    if (exactRangeKey) {
      const data = await redisClient.client.hGetAll(exactRangeKey);
      if (Object.keys(data).length > 0) {
        return this.createLookupResult(ip, 4, data);
      }
    }

    // Scan for a range that contains this IP
    let cursor = 0;
    let scannedKeys = 0;
    const maxScannedKeys = 50000; // Limit scan to prevent excessive processing

    do {
      const result = await redisClient.client.scan(cursor, {
        MATCH: "geoip:v4:range:*",
        COUNT: 1000,
      });

      cursor = result.cursor;
      scannedKeys += result.keys.length;

      for (const key of result.keys) {
        // Keys are in the format: geoip:v4:range:{startIp}:{endIp}
        const parts = key.split(":");
        if (parts.length < 5) continue;

        const startIpSigned = parseInt(parts[3], 10);
        const endIpSigned = parseInt(parts[4], 10);

        // Convert to unsigned for fair comparison
        const startIpUnsigned = IpUtil.toUnsigned32(startIpSigned);
        const endIpUnsigned = IpUtil.toUnsigned32(endIpSigned);

        // Check if the IP falls within this range
        if (ipLong >= startIpUnsigned && ipLong <= endIpUnsigned) {
          const data = await redisClient.client.hGetAll(key);
          if (Object.keys(data).length > 0) {
            return this.createLookupResult(ip, 4, data);
          }
        }
      }

      // Prevent excessive scanning
      if (scannedKeys >= maxScannedKeys) {
        console.warn(
          `Exceeded maximum scan limit (${maxScannedKeys}) for IPv4 lookup: ${ip}`
        );
        break;
      }
    } while (cursor !== 0);

    return null;
  }

  /**
   * Look up geolocation data for an IPv6 address
   */
  private async lookupIpv6(ip: string): Promise<GeoIpLookupResult | null> {
    try {
      // Use the dedicated Ipv6Util class directly
      const normalizedIp = Ipv6Util.normalize(ip);
      const ipBigInt = Ipv6Util.toBigInt(normalizedIp);

      // Try exact index match first
      const exactIndexKey = `geoip:v6:idx:${ipBigInt.toString()}`;
      const exactRangeKey = await redisClient.client.get(exactIndexKey);

      if (exactRangeKey) {
        const data = await redisClient.client.hGetAll(exactRangeKey);
        if (Object.keys(data).length > 0) {
          return this.createLookupResult(ip, 6, data);
        }
      }

      // Scan for ranges
      let cursor = 0;
      let scannedKeys = 0;
      const maxScannedKeys = 10000; // Lower limit for IPv6 due to complexity

      do {
        const result = await redisClient.client.scan(cursor, {
          MATCH: "geoip:v6:range:*",
          COUNT: 1000,
        });

        cursor = result.cursor;
        scannedKeys += result.keys.length;

        for (const key of result.keys) {
          const parts = key.split(":");
          if (parts.length < 5) continue;

          const startIpBigInt = BigInt(parts[3]);
          const endIpBigInt = BigInt(parts[4]);

          // Use Ipv6Util to check range containment
          if (Ipv6Util.isInRange(normalizedIp, startIpBigInt, endIpBigInt)) {
            const data = await redisClient.client.hGetAll(key);
            if (Object.keys(data).length > 0) {
              return this.createLookupResult(ip, 6, data);
            }
          }
        }

        // Prevent excessive scanning
        if (scannedKeys >= maxScannedKeys) {
          console.warn(
            `Exceeded maximum scan limit (${maxScannedKeys}) for IPv6 lookup: ${ip}`
          );
          break;
        }
      } while (cursor !== 0);
    } catch (error) {
      // Log the error for IPv6 lookups but don't fail the whole lookup
      console.error(`IPv6 lookup error for ${ip}:`, error);
    }

    return null;
  }
}

// Export a singleton instance
export const geoLookupService = new GeoLookupService();
