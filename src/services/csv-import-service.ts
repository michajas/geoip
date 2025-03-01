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
}

export class CsvImportService {
  private static readonly DEFAULT_DATA_DIR = path.join(process.cwd(), "data");
  private locationMap: Map<string, GeoIpLocation> = new Map();

  /**
   * Import data from GeoIP2 CSV files into Redis
   */
  public async importData(options: ImportOptions = {}): Promise<void> {
    console.log("Starting GeoIP data import...");

    const dataDir = options.dataDir || CsvImportService.DEFAULT_DATA_DIR;

    // Find files if not specified
    const files = this.resolveFiles(options, dataDir);
    if (!files.locationsFile) {
      throw new Error("Locations file not found or specified");
    }

    // Clear existing data if requested
    if (options.clearExisting) {
      await this.clearExistingData();
    }

    // Process locations file
    console.log(`Processing locations file: ${files.locationsFile}`);
    await this.processLocationsFile(files.locationsFile);
    console.log(`Loaded ${this.locationMap.size} locations`);

    // Process IPv4 blocks if available
    if (files.ipv4File) {
      console.log(`Processing IPv4 blocks file: ${files.ipv4File}`);
      const ipv4Count = await this.processIpv4File(files.ipv4File);
      console.log(`Imported ${ipv4Count} IPv4 blocks`);
    }

    // Process IPv6 blocks if available
    if (files.ipv6File) {
      console.log(`Processing IPv6 blocks file: ${files.ipv6File}`);
      const ipv6Count = await this.processIpv6File(files.ipv6File);
      console.log(`Imported ${ipv6Count} IPv6 blocks`);
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

    // Get all keys matching our prefix
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
      fs.createReadStream(filePath)
        .pipe(csv())
        .on("data", (row) => {
          // Store location data in memory map
          this.locationMap.set(row.geoname_id, {
            geonameId: row.geoname_id,
            countryCode: row.country_iso_code || "",
            country: row.country_name || "",
            state: row.subdivision_1_name || "",
            city: row.city_name || "",
            timezone: row.time_zone || "",
            isEU: row.is_in_european_union === "1",
          });
        })
        .on("end", () => {
          resolve();
        })
        .on("error", (err) => {
          reject(err);
        });
    });
  }

  /**
   * Process GeoIP2-City-Blocks-IPv4.csv file
   */
  private async processIpv4File(filePath: string): Promise<number> {
    let count = 0;

    return new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on("data", async (row) => {
          try {
            // Parse the network (e.g., 1.0.0.0/24)
            const network = row.network;
            if (!network || !row.geoname_id) return;

            const location = this.locationMap.get(row.geoname_id);
            if (!location) return; // Skip if no location data

            // Parse CIDR notation
            const [ip, prefixStr] = network.split("/");
            const prefix = parseInt(prefixStr, 10);

            // Calculate IP range
            const ipLong = IpUtil.ipToLong(ip);
            const mask = ~((1 << (32 - prefix)) - 1);
            const startIp = ipLong & mask;
            const endIp = startIp | ~mask;

            // Store in Redis
            const key = `geoip:v4:range:${startIp}:${endIp}`;

            await redisClient.hSet(key, "countryCode", location.countryCode);
            await redisClient.hSet(key, "country", location.country);
            await redisClient.hSet(key, "state", location.state);
            await redisClient.hSet(key, "city", location.city);
            await redisClient.hSet(key, "startIp", IpUtil.longToIp(startIp));
            await redisClient.hSet(key, "endIp", IpUtil.longToIp(endIp));
            await redisClient.hSet(key, "latitude", row.latitude || "");
            await redisClient.hSet(key, "longitude", row.longitude || "");

            // Create index for fast lookups
            await redisClient.set(`geoip:v4:idx:${startIp}`, key);

            count++;
          } catch (err) {
            console.error(`Error processing IPv4 row:`, err);
          }
        })
        .on("end", () => {
          resolve(count);
        })
        .on("error", (err) => {
          reject(err);
        });
    });
  }

  /**
   * Process GeoIP2-City-Blocks-IPv6.csv file
   */
  private async processIpv6File(filePath: string): Promise<number> {
    let count = 0;

    return new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on("data", async (row) => {
          try {
            // Parse the network (e.g., 2001:200::/32)
            const network = row.network;
            if (!network || !row.geoname_id) return;

            const location = this.locationMap.get(row.geoname_id);
            if (!location) return; // Skip if no location data

            // Parse CIDR notation
            const [ip, prefixStr] = network.split("/");
            const prefix = parseInt(prefixStr, 10);

            try {
              // Calculate IPv6 range as BigInt
              const normalizedIp = IpUtil.normalizeIpv6(ip);
              const ipBigInt = IpUtil.ipv6ToBigInt(normalizedIp);

              // Create masks using BigInt
              const maxBits = BigInt(128);
              const prefixBigInt = BigInt(prefix);
              const mask = (BigInt(1) << (maxBits - prefixBigInt)) - BigInt(1);
              const startIp = ipBigInt & ~mask;
              const endIp = ipBigInt | mask;

              // Store in Redis
              const key = `geoip:v6:range:${startIp}:${endIp}`;

              await redisClient.hSet(key, "countryCode", location.countryCode);
              await redisClient.hSet(key, "country", location.country);
              await redisClient.hSet(key, "state", location.state);
              await redisClient.hSet(key, "city", location.city);
              await redisClient.hSet(
                key,
                "startIp",
                IpUtil.bigIntToIpv6(startIp)
              );
              await redisClient.hSet(key, "endIp", IpUtil.bigIntToIpv6(endIp));
              await redisClient.hSet(key, "latitude", row.latitude || "");
              await redisClient.hSet(key, "longitude", row.longitude || "");

              // Create index for lookups
              await redisClient.set(`geoip:v6:idx:${startIp.toString()}`, key);

              count++;
            } catch (err) {
              console.error(`Error processing IPv6 address ${ip}:`, err);
            }
          } catch (err) {
            console.error(`Error processing IPv6 row:`, err);
          }
        })
        .on("end", () => {
          resolve(count);
        })
        .on("error", (err) => {
          reject(err);
        });
    });
  }
}

// Export a singleton instance
export const csvImportService = new CsvImportService();
