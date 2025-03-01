import { redisClient } from "./redis-client";
import { IpUtil } from "./ip-util";

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
   * Convert between signed and unsigned 32-bit integers
   */
  private toSigned32(n: number): number {
    return n > 0x7fffffff ? n - 0x100000000 : n;
  }

  private toUnsigned32(n: number): number {
    return n < 0 ? n + 0x100000000 : n;
  }

  /**
   * Look up geolocation data for an IPv4 address
   */
  private async lookupIpv4(ip: string): Promise<GeoIpLookupResult | null> {
    const ipLong = IpUtil.ipToLong(ip);
    const ipLongSigned = this.toSigned32(ipLong);

    // Try direct index lookup first
    const exactIndexKey = `geoip:v4:idx:${ipLongSigned}`;
    const exactRangeKey = await redisClient.client.get(exactIndexKey);

    if (exactRangeKey) {
      const data = await redisClient.client.hGetAll(exactRangeKey);
      if (Object.keys(data).length > 0) {
        return {
          ip,
          ipVersion: 4,
          countryCode: data.countryCode,
          country: data.country,
          state: data.state,
          city: data.city,
          latitude: data.latitude,
          longitude: data.longitude,
        };
      }
    }

    // Scan for a range that contains this IP
    let cursor = 0;

    do {
      const result = await redisClient.client.scan(cursor, {
        MATCH: "geoip:v4:range:*",
        COUNT: 1000,
      });

      cursor = result.cursor;

      for (const key of result.keys) {
        // Keys are in the format: geoip:v4:range:{startIp}:{endIp}
        const parts = key.split(":");
        if (parts.length < 5) continue;

        const startIpSigned = parseInt(parts[3], 10);
        const endIpSigned = parseInt(parts[4], 10);

        // Convert to unsigned for fair comparison
        const startIpUnsigned = this.toUnsigned32(startIpSigned);
        const endIpUnsigned = this.toUnsigned32(endIpSigned);

        // Check if the IP falls within this range
        if (ipLong >= startIpUnsigned && ipLong <= endIpUnsigned) {
          const data = await redisClient.client.hGetAll(key);
          if (Object.keys(data).length > 0) {
            return {
              ip,
              ipVersion: 4,
              countryCode: data.countryCode,
              country: data.country,
              state: data.state,
              city: data.city,
              latitude: data.latitude,
              longitude: data.longitude,
            };
          }
        }
      }
    } while (cursor !== 0);

    return null;
  }

  /**
   * Look up geolocation data for an IPv6 address
   */
  private async lookupIpv6(ip: string): Promise<GeoIpLookupResult | null> {
    try {
      // Normalize the IP
      const normalizedIp = IpUtil.normalizeIpv6(ip);

      // Convert to BigInt for comparison
      const ipBigInt = IpUtil.ipv6ToBigInt(normalizedIp);

      // Try exact index match first
      const exactIndexKey = `geoip:v6:idx:${ipBigInt.toString()}`;
      const exactRangeKey = await redisClient.client.get(exactIndexKey);

      if (exactRangeKey) {
        const data = await redisClient.client.hGetAll(exactRangeKey);
        if (Object.keys(data).length > 0) {
          return {
            ip,
            ipVersion: 6,
            countryCode: data.countryCode,
            country: data.country,
            state: data.state,
            city: data.city,
            latitude: data.latitude,
            longitude: data.longitude,
          };
        }
      }

      // Scan for ranges
      let cursor = 0;

      do {
        const result = await redisClient.client.scan(cursor, {
          MATCH: "geoip:v6:range:*",
          COUNT: 1000,
        });

        cursor = result.cursor;

        for (const key of result.keys) {
          const parts = key.split(":");
          if (parts.length < 5) continue;

          const startIpBigInt = BigInt(parts[3]);
          const endIpBigInt = BigInt(parts[4]);

          if (ipBigInt >= startIpBigInt && ipBigInt <= endIpBigInt) {
            const data = await redisClient.client.hGetAll(key);
            if (Object.keys(data).length > 0) {
              return {
                ip,
                ipVersion: 6,
                countryCode: data.countryCode,
                country: data.country,
                state: data.state,
                city: data.city,
                latitude: data.latitude,
                longitude: data.longitude,
              };
            }
          }
        }
      } while (cursor !== 0);
    } catch (error) {
      // Ignore errors in IPv6 lookup
    }

    return null;
  }
}

// Export a singleton instance
export const geoLookupService = new GeoLookupService();
