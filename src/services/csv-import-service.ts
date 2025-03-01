import fs from "fs";
import path from "path";
import csv from "csv-parser";
import { redisClient } from "./redis-client";
import { IpUtil } from "./ip-util";

export interface GeoIpLocation {
  geonameId: string;
  countryCode: string;
  country: string;
  state: string;
  city: string;
  timezone: string;
  isEU: boolean;
}

export interface GeoIpBlock {
  network: string;
  geonameId: string;
  postalCode: string;
  latitude: number;
  longitude: number;
  accuracyRadius: number;
}

export interface ImportOptions {
  locationsFile?: string;
  ipv4File?: string;
  ipv6File?: string;
  dataDir?: string;
  clearExisting?: boolean;
  skipProblemIpv6?: boolean; // New option to skip problematic IPv6 ranges
}

// Add interface for IPv6 network parsing result
interface ParsedIpv6Network {
  ip: string;
  prefix: number;
  normalizedIp: string;
}

// Add interface for IPv6 range calculation result
interface Ipv6Range {
  startIp: bigint;
  endIp: bigint;
  startIpStr: string;
  endIpStr: string;
}

export class CsvImportService {
  private static readonly DEFAULT_DATA_DIR = path.join(process.cwd(), "data");
  private locationMap: Map<string, GeoIpLocation> = new Map();

  // Known problematic IPv6 prefixes
  private static readonly PROBLEMATIC_IPV6_PREFIXES = [
    "2a02:ffc0",
    "2a02:e680",
    "2a05:",
    "2a06:",
    "2a07:",
  ];

  /**
   * Import data from GeoIP2 CSV files into Redis
   */
  public async importData(options: ImportOptions = {}): Promise<void> {
    console.log("Starting GeoIP data import...");

    const dataDir = options.dataDir || CsvImportService.DEFAULT_DATA_DIR;
    const files = this.resolveFiles(options, dataDir);

    if (!files.locationsFile) {
      throw new Error("Locations file not found or specified");
    }

    if (options.clearExisting) {
      await this.clearExistingData();
    }

    console.log(`Processing locations file: ${files.locationsFile}`);
    await this.processLocationsFile(files.locationsFile);
    console.log(`Loaded ${this.locationMap.size} locations`);

    await redisClient.ensureConnection();

    if (files.ipv4File) {
      console.log(`Processing IPv4 blocks file: ${files.ipv4File}`);
      try {
        const ipv4Count = await this.processIpv4File(files.ipv4File);
        console.log(`Imported ${ipv4Count} IPv4 blocks`);
      } catch (error) {
        console.error(`Error processing IPv4 file: ${error.message}`);
      }
    }

    if (files.ipv6File) {
      console.log(`Processing IPv6 blocks file: ${files.ipv6File}`);
      try {
        const ipv6Count = await this.processIpv6File(files.ipv6File);
        console.log(`Imported ${ipv6Count} IPv6 blocks`);
      } catch (error) {
        console.error(`Error processing IPv6 file: ${error.message}`);
      }
    }

    console.log("GeoIP data import completed successfully");
  }

  /**
   * Resolve file paths based on options and defaults
   */
  private resolveFiles(
    options: ImportOptions,
    dataDir: string
  ): {
    locationsFile?: string;
    ipv4File?: string;
    ipv6File?: string;
  } {
    const files: {
      locationsFile?: string;
      ipv4File?: string;
      ipv6File?: string;
    } = {
      locationsFile: options.locationsFile,
      ipv4File: options.ipv4File,
      ipv6File: options.ipv6File,
    };

    // If files weren't specified, try to find them in the data directory
    if (!fs.existsSync(dataDir)) {
      console.log(`Data directory ${dataDir} not found`);
      return files;
    }

    const dirFiles = fs.readdirSync(dataDir);

    if (!files.locationsFile) {
      const locationFile = dirFiles.find(
        (f) => /city.*locations/i.test(f) && f.endsWith(".csv")
      );
      if (locationFile) {
        files.locationsFile = path.join(dataDir, locationFile);
      }
    }

    if (!files.ipv4File) {
      const ipv4File = dirFiles.find(
        (f) => /blocks.*ipv4/i.test(f) && f.endsWith(".csv")
      );
      if (ipv4File) {
        files.ipv4File = path.join(dataDir, ipv4File);
      }
    }

    if (!files.ipv6File) {
      const ipv6File = dirFiles.find(
        (f) => /blocks.*ipv6/i.test(f) && f.endsWith(".csv")
      );
      if (ipv6File) {
        files.ipv6File = path.join(dataDir, ipv6File);
      }
    }

    return files;
  }

  /**
   * Clear existing GeoIP data from Redis
   */
  private async clearExistingData(): Promise<void> {
    console.log("Clearing existing GeoIP data...");
    const prefixes = ["geoip:v4:", "geoip:v6:"];
    let cleared = 0;

    for (const prefix of prefixes) {
      let cursor = 0;
      do {
        const result = await redisClient.client.scan(cursor, {
          MATCH: `${prefix}*`,
          COUNT: 1000,
        });

        cursor = result.cursor;
        if (result.keys.length > 0) {
          await redisClient.client.del(result.keys);
          cleared += result.keys.length;
        }
      } while (cursor !== 0);
    }

    console.log(`Cleared ${cleared} keys from Redis`);
  }

  /**
   * Process GeoIP2-City-Locations-en.csv file
   */
  private async processLocationsFile(filePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let count = 0;
      fs.createReadStream(filePath)
        .pipe(csv())
        .on("data", (row) => {
          count++;

          if (row.geoname_id) {
            this.locationMap.set(row.geoname_id, {
              geonameId: row.geoname_id,
              countryCode: row.country_iso_code || "",
              country: row.country_name || "",
              state: row.subdivision_1_name || "",
              city: row.city_name || "",
              timezone: row.time_zone || "",
              isEU: row.is_in_european_union === "1",
            });
          }
        })
        .on("end", () => {
          resolve();
        })
        .on("error", (err) => {
          console.error(`Error reading locations file: ${err.message}`);
          reject(err);
        });
    });
  }

  /**
   * Process GeoIP2-City-Blocks-IPv4.csv file
   */
  private async processIpv4File(filePath: string): Promise<number> {
    let totalCount = 0;
    let successCount = 0;
    let errorCount = 0;

    return new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on("data", async (row) => {
          totalCount++;

          try {
            // Extract location info
            const location = this.getLocationFromRow(row);
            if (!location) return;

            // Parse CIDR and convert to range
            const { startIp, endIp } = this.parseIpv4Range(row.network);
            if (startIp === null || endIp === null) return;

            // Store in Redis
            await this.storeIpv4Range(startIp, endIp, location, row);
            successCount++;

            if (successCount % 10000 === 0) {
              console.log(`Processed ${successCount} IPv4 blocks...`);
            }
          } catch (err) {
            errorCount++;
            if (errorCount <= 5) {
              console.error(`Error processing IPv4 row: ${err.message}`);
            }
          }
        })
        .on("end", () => {
          console.log(
            `IPv4 processing complete: ${successCount} successful, ${errorCount} errors`
          );
          resolve(successCount);
        })
        .on("error", (err) => {
          console.error(`Error reading IPv4 file: ${err.message}`);
          reject(err);
        });
    });
  }

  /**
   * Get location data from a row
   */
  private getLocationFromRow(row: any): GeoIpLocation | null {
    // Get the geoname_id, try to use various fallbacks
    const geonameId =
      row.geoname_id ||
      row.registered_country_geoname_id ||
      row.represented_country_geoname_id;

    if (!geonameId) return null;

    return this.locationMap.get(geonameId) || null;
  }

  /**
   * Parse an IPv4 CIDR notation into a range
   */
  private parseIpv4Range(network: string): {
    startIp: number | null;
    endIp: number | null;
  } {
    if (!network) return { startIp: null, endIp: null };

    const cidrParts = network.split("/");
    if (cidrParts.length !== 2) return { startIp: null, endIp: null };

    const ip = cidrParts[0];
    const prefixStr = cidrParts[1];
    const prefix = parseInt(prefixStr, 10);

    if (!IpUtil.isValidIpv4(ip) || isNaN(prefix) || prefix < 0 || prefix > 32) {
      return { startIp: null, endIp: null };
    }

    const ipLong = IpUtil.ipToLong(ip);
    const mask = ~((1 << (32 - prefix)) - 1);
    const startIp = ipLong & mask;
    const endIp = startIp | ~mask;

    return { startIp, endIp };
  }

  /**
   * Store an IPv4 range in Redis
   */
  private async storeIpv4Range(
    startIp: number,
    endIp: number,
    location: GeoIpLocation,
    row: any
  ): Promise<void> {
    const key = `geoip:v4:range:${IpUtil.toSigned32(
      startIp
    )}:${IpUtil.toSigned32(endIp)}`;
    const pipeline = redisClient.client.multi();

    // Basic location data
    pipeline.hSet(key, "countryCode", location.countryCode);
    pipeline.hSet(key, "country", location.country);
    pipeline.hSet(key, "state", location.state);
    pipeline.hSet(key, "city", location.city);
    pipeline.hSet(key, "startIp", IpUtil.longToIp(startIp));
    pipeline.hSet(key, "endIp", IpUtil.longToIp(endIp));

    // Additional location data if available
    if (row.latitude) pipeline.hSet(key, "latitude", row.latitude);
    if (row.longitude) pipeline.hSet(key, "longitude", row.longitude);

    // Create index for fast lookups
    pipeline.set(`geoip:v4:idx:${IpUtil.toSigned32(startIp)}`, key);

    await pipeline.exec();
  }

  /**
   * Process GeoIP2-City-Blocks-IPv6.csv file
   */
  private async processIpv6File(filePath: string): Promise<number> {
    let totalCount = 0;
    let successCount = 0;
    let errorCount = 0;
    let skippedNetworks = 0;

    return new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on("data", async (row) => {
          totalCount++;

          try {
            // Get location info
            const location = this.getLocationFromRow(row);
            if (!location) return;

            // Parse and validate IPv6 network
            const parsedNetwork = this.parseIpv6Network(row.network);
            if (!parsedNetwork) {
              skippedNetworks++;
              return;
            }

            // Calculate range
            const range = this.calculateIpv6Range(
              parsedNetwork.normalizedIp,
              parsedNetwork.prefix
            );
            if (!range) {
              skippedNetworks++;
              return;
            }

            // Store in Redis
            await this.storeIpv6Range(range, location, row);
            successCount++;

            if (successCount % 5000 === 0) {
              console.log(`Processed ${successCount} IPv6 blocks...`);
            }
          } catch (err) {
            errorCount++;
            // Limit error logging to avoid flooding console
            if (errorCount <= 10) {
              console.error(`Error processing IPv6 row:`, err);
            }
          }
        })
        .on("end", () => {
          console.log(
            `IPv6 processing complete: ${successCount} successful, ${errorCount} errors, ${skippedNetworks} skipped`
          );
          resolve(successCount);
        })
        .on("error", (err) => {
          console.error(`Error reading IPv6 file:`, err);
          reject(err);
        });
    });
  }

  /**
   * Parse an IPv6 network string
   */
  private parseIpv6Network(network: string): ParsedIpv6Network | null {
    if (!network) return null;

    // Skip known problematic networks
    const isProblematic = CsvImportService.PROBLEMATIC_IPV6_PREFIXES.some(
      (prefix) => network.startsWith(prefix)
    );

    if (network.includes("::::") || isProblematic) {
      return null;
    }

    // Split into IP and prefix
    const parts = network.split("/");
    if (parts.length !== 2) return null;

    const ip = parts[0];
    const prefixStr = parts[1];
    const prefix = parseInt(prefixStr, 10);

    if (isNaN(prefix) || prefix < 0 || prefix > 128) return null;

    // Normalize and validate the IP
    let normalizedIp;
    try {
      normalizedIp = IpUtil.normalizeIpv6(ip);
    } catch (err) {
      return null;
    }

    return { ip, prefix, normalizedIp };
  }

  /**
   * Calculate IPv6 range from IP and prefix
   */
  private calculateIpv6Range(ip: string, prefix: number): Ipv6Range | null {
    try {
      const ipBigInt = IpUtil.ipv6ToBigInt(ip);
      const maxBits = BigInt(128);
      const prefixBigInt = BigInt(prefix);

      // Calculate mask
      let mask;
      if (prefixBigInt === maxBits) {
        mask = BigInt(0);
      } else {
        const shiftAmount = maxBits - prefixBigInt;
        if (shiftAmount > 100) {
          // For very large shifts, be extra careful
          mask = BigInt(2) ** shiftAmount - BigInt(1);
        } else {
          mask = (BigInt(1) << shiftAmount) - BigInt(1);
        }
      }

      const startIp = ipBigInt & ~mask;
      const endIp = ipBigInt | mask;

      const startIpStr = IpUtil.bigIntToIpv6(startIp);
      const endIpStr = IpUtil.bigIntToIpv6(endIp);

      if (!startIpStr || !endIpStr) return null;

      return { startIp, endIp, startIpStr, endIpStr };
    } catch (err) {
      return null;
    }
  }

  /**
   * Store an IPv6 range in Redis
   */
  private async storeIpv6Range(
    range: Ipv6Range,
    location: GeoIpLocation,
    row: any
  ): Promise<void> {
    const key = `geoip:v6:range:${range.startIp}:${range.endIp}`;
    const pipeline = redisClient.client.multi();

    // Basic location data
    pipeline.hSet(key, "countryCode", location.countryCode || "");
    pipeline.hSet(key, "country", location.country || "");
    pipeline.hSet(key, "state", location.state || "");
    pipeline.hSet(key, "city", location.city || "");
    pipeline.hSet(key, "startIp", range.startIpStr);
    pipeline.hSet(key, "endIp", range.endIpStr);

    // Additional location data if available
    if (row.latitude) pipeline.hSet(key, "latitude", row.latitude);
    if (row.longitude) pipeline.hSet(key, "longitude", row.longitude);

    // Create index for fast lookups
    pipeline.set(`geoip:v6:idx:${range.startIp.toString()}`, key);

    await pipeline.exec();
  }
}

// Export a singleton instance
export const csvImportService = new CsvImportService();
