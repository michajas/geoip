import { RedisClient } from "./redis-client";
import { IpUtil } from "./ip-util";
import { RangeSearchUtil, IpRange } from "./range-search-util";

/**
 * Service for looking up IP geolocation data
 */
export class GeoIpLookupService {
  private redisClient: RedisClient;
  private ipv4Ranges: IpRange<number>[] | null = null;
  private ipv6Ranges: IpRange<bigint>[] | null = null;
  private lastRangeUpdate = 0;
  private readonly RANGE_UPDATE_INTERVAL = 60 * 1000; // 1 minute

  constructor(redisClient: RedisClient) {
    this.redisClient = redisClient;
  }

  /**
   * Look up geolocation data for an IP address
   */
  async lookup(ip: string): Promise<any> {
    // Determine IP version
    const version = IpUtil.getIpVersion(ip);
    if (!version) {
      throw new Error(`Invalid IP address: ${ip}`);
    }

    // Use binary search for lookups
    if (version === 4) {
      return this.lookupIpv4WithBinarySearch(ip);
    } else {
      return this.lookupIpv6WithBinarySearch(ip);
    }
  }

  /**
   * Look up IPv4 address using binary search
   */
  private async lookupIpv4WithBinarySearch(ip: string): Promise<any> {
    // Update ranges cache if needed
    await this.ensureRangesCached();

    if (!this.ipv4Ranges || this.ipv4Ranges.length === 0) {
      return null;
    }

    // Perform binary search
    const matchingRange = RangeSearchUtil.findIpv4Range(ip, this.ipv4Ranges);

    if (matchingRange) {
      // Found a match, get the data from Redis
      return this.redisClient.hGetAll(matchingRange.key);
    }

    return null;
  }

  /**
   * Look up IPv6 address using binary search
   */
  private async lookupIpv6WithBinarySearch(ip: string): Promise<any> {
    // Update ranges cache if needed
    await this.ensureRangesCached();

    if (!this.ipv6Ranges || this.ipv6Ranges.length === 0) {
      return null;
    }

    // Perform binary search
    const matchingRange = RangeSearchUtil.findIpv6Range(ip, this.ipv6Ranges);

    if (matchingRange) {
      // Found a match, get the data from Redis
      return this.redisClient.hGetAll(matchingRange.key);
    }

    return null;
  }

  /**
   * Ensure that we have an up-to-date cache of IP ranges
   */
  private async ensureRangesCached(): Promise<void> {
    const now = Date.now();

    // Update cache if it's empty or outdated
    if (
      !this.ipv4Ranges ||
      !this.ipv6Ranges ||
      now - this.lastRangeUpdate > this.RANGE_UPDATE_INTERVAL
    ) {
      // Scan for all range keys
      await this.updateRangesCache();
      this.lastRangeUpdate = now;
    }
  }

  /**
   * Scan Redis for all range keys and update the cache
   */
  private async updateRangesCache(): Promise<void> {
    // Get all keys in Redis
    let allKeys: string[] = [];
    let cursor = 0;

    do {
      const result = await this.redisClient.client.scan(cursor, {
        MATCH: "geoip:*:range:*",
        COUNT: 1000,
      });

      cursor = result.cursor;
      allKeys = allKeys.concat(result.keys);
    } while (cursor !== 0);

    // Parse keys into range objects
    const ipv4RangesUnsorted = RangeSearchUtil.parseIpv4RangesFromKeys(allKeys);
    const ipv6RangesUnsorted = RangeSearchUtil.parseIpv6RangesFromKeys(allKeys);

    // Sort ranges for binary search
    this.ipv4Ranges = RangeSearchUtil.sortIpv4Ranges(ipv4RangesUnsorted);
    this.ipv6Ranges = RangeSearchUtil.sortIpv6Ranges(ipv6RangesUnsorted);

    console.log(
      `Updated IP range cache: ${this.ipv4Ranges.length} IPv4 ranges, ${this.ipv6Ranges.length} IPv6 ranges`
    );
  }
}
