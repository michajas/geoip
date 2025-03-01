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
   * @param ip The IP address to look up
   * @returns The geolocation data or null if not found
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
    // Convert unsigned to signed if necessary
    return n > 0x7fffffff ? n - 0x100000000 : n;
  }

  private toUnsigned32(n: number): number {
    // Convert signed to unsigned if necessary
    return n < 0 ? n + 0x100000000 : n;
  }

  /**
   * Look up geolocation data for an IPv4 address using binary search
   */
  private async lookupIpv4(ip: string): Promise<GeoIpLookupResult | null> {
    console.log(`Looking up IPv4 address: ${ip}`);
    const ipLong = IpUtil.ipToLong(ip);
    const ipLongSigned = this.toSigned32(ipLong);

    console.log(`IP as unsigned: ${ipLong}, as signed: ${ipLongSigned}`);

    // First attempt: Try to find an exact index match (for /32 networks)
    const exactIndexKey = `geoip:v4:idx:${ipLongSigned}`;
    const exactRangeKey = await redisClient.client.get(exactIndexKey);

    if (exactRangeKey) {
      console.log(
        `Found exact match index key: ${exactIndexKey} -> ${exactRangeKey}`
      );
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

    // Second attempt: Scan for a range that contains this IP
    console.log(`No exact match found for ${ip}, scanning ranges...`);
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

        // Check if the IP falls within this range (using unsigned for comparison)
        if (ipLong >= startIpUnsigned && ipLong <= endIpUnsigned) {
          console.log(`Found matching range: ${key} for ${ip} (${ipLong})`);
          console.log(
            `Range bounds: ${startIpSigned} to ${endIpSigned} (signed)`
          );
          console.log(
            `Range bounds: ${startIpUnsigned} to ${endIpUnsigned} (unsigned)`
          );

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

    console.log(`No matching range found for ${ip} (${ipLong})`);
    return null;
  }

  /**
   * Look up geolocation data for an IPv6 address
   */
  private async lookupIpv6(ip: string): Promise<GeoIpLookupResult | null> {
    // Implement IPv6 lookup using the same pattern as IPv4
    // ...existing IPv6 lookup code...
    return null; // Placeholder until fully implemented
  }
}

// Export a singleton instance
export const geoLookupService = new GeoLookupService();
