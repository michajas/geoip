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

export class CsvImportService {
  private static readonly DEFAULT_DATA_DIR = path.join(process.cwd(), "data");
  private locationMap: Map<string, GeoIpLocation> = new Map();

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
            const network = row.network;
            if (!network) return;

            const geonameId =
              row.geoname_id ||
              row.registered_country_geoname_id ||
              row.represented_country_geoname_id;

            if (!geonameId) return;

            const location = this.locationMap.get(geonameId);
            if (!location) return;

            const cidrParts = network.split("/");
            if (cidrParts.length !== 2) return;

            const ip = cidrParts[0];
            const prefixStr = cidrParts[1];
            const prefix = parseInt(prefixStr, 10);

            if (
              !IpUtil.isValidIpv4(ip) ||
              isNaN(prefix) ||
              prefix < 0 ||
              prefix > 32
            ) {
              return;
            }

            const ipLong = IpUtil.ipToLong(ip);
            const mask = ~((1 << (32 - prefix)) - 1);
            const startIp = ipLong & mask;
            const endIp = startIp | ~mask;

            const key = `geoip:v4:range:${startIp}:${endIp}`;
            const pipeline = redisClient.client.multi();

            pipeline.hSet(key, "countryCode", location.countryCode);
            pipeline.hSet(key, "country", location.country);
            pipeline.hSet(key, "state", location.state);
            pipeline.hSet(key, "city", location.city);
            pipeline.hSet(key, "startIp", IpUtil.longToIp(startIp));
            pipeline.hSet(key, "endIp", IpUtil.longToIp(endIp));

            if (row.latitude) pipeline.hSet(key, "latitude", row.latitude);
            if (row.longitude) pipeline.hSet(key, "longitude", row.longitude);

            pipeline.set(`geoip:v4:idx:${startIp}`, key);

            await pipeline.exec();
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
   * Process GeoIP2-City-Blocks-IPv6.csv file
   */
  private async processIpv6File(filePath: string): Promise<number> {
    let totalCount = 0;
    let successCount = 0;
    let errorCount = 0;
    let skippedNetworks = 0;

    // Known problematic IPv6 prefixes
    const problemPrefixes = [
      "2a02:ffc0",
      "2a02:e680",
      "2a05:",
      "2a06:",
      "2a07:",
    ];

    return new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on("data", async (row) => {
          totalCount++;

          try {
            const network = row.network;
            if (!network) return;

            // Skip known problematic networks
            const isProblematic = problemPrefixes.some((prefix) =>
              network.startsWith(prefix)
            );
            if (network.includes("::::") || isProblematic) {
              skippedNetworks++;
              return;
            }

            const geonameId =
              row.geoname_id ||
              row.registered_country_geoname_id ||
              row.represented_country_geoname_id;

            if (!geonameId) return;

            const location = this.locationMap.get(geonameId);
            if (!location) return;

            // Parse CIDR notation
            try {
              const parts = network.split("/");
              if (parts.length !== 2) return;

              const ip = parts[0];
              const prefixStr = parts[1];
              const prefix = parseInt(prefixStr, 10);

              if (isNaN(prefix) || prefix < 0 || prefix > 128) return;

              // Normalize IP format
              let normalizedIp;
              try {
                normalizedIp = IpUtil.normalizeIpv6(ip);
              } catch (err) {
                return;
              }

              // Calculate range with BigInt
              try {
                const ipBigInt = IpUtil.ipv6ToBigInt(normalizedIp);
                const maxBits = BigInt(128);
                const prefixBigInt = BigInt(prefix);

                if (prefixBigInt < 0 || prefixBigInt > 128) return;

                // Calculate mask
                let mask;
                if (prefixBigInt === maxBits) {
                  mask = BigInt(0);
                } else {
                  const shiftAmount = maxBits - prefixBigInt;
                  if (shiftAmount > 100) {
                    mask = BigInt(2) ** shiftAmount - BigInt(1);
                  } else {
                    mask = (BigInt(1) << shiftAmount) - BigInt(1);
                  }
                }

                const startIp = ipBigInt & ~mask;
                const endIp = ipBigInt | mask;

                const startIpStr = IpUtil.bigIntToIpv6(startIp);
                const endIpStr = IpUtil.bigIntToIpv6(endIp);

                if (!startIpStr || !endIpStr) return;

                const key = `geoip:v6:range:${startIp}:${endIp}`;
                const pipeline = redisClient.client.multi();

                pipeline.hSet(key, "countryCode", location.countryCode || "");
                pipeline.hSet(key, "country", location.country || "");
                pipeline.hSet(key, "state", location.state || "");
                pipeline.hSet(key, "city", location.city || "");
                pipeline.hSet(key, "startIp", startIpStr);
                pipeline.hSet(key, "endIp", endIpStr);

                if (row.latitude) pipeline.hSet(key, "latitude", row.latitude);
                if (row.longitude)
                  pipeline.hSet(key, "longitude", row.longitude);

                pipeline.set(`geoip:v6:idx:${startIp.toString()}`, key);

                await pipeline.exec();
                successCount++;

                if (successCount % 5000 === 0) {
                  console.log(`Processed ${successCount} IPv6 blocks...`);
                }
              } catch (err) {
                errorCount++;
              }
            } catch (err) {
              errorCount++;
            }
          } catch (err) {
            errorCount++;
          }
        })
        .on("end", () => {
          console.log(
            `IPv6 processing complete: ${successCount} successful, ${errorCount} errors, ${skippedNetworks} skipped`
          );
          resolve(successCount);
        })
        .on("error", (err) => {
          console.error(`Error reading IPv6 file: ${err.message}`);
          reject(err);
        });
    });
  }
}

// Export a singleton instance
export const csvImportService = new CsvImportService();
