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

    // Connect to Redis before processing IP files
    console.log("Connecting to Redis...");
    await redisClient.ensureConnection();

    // Process IPv4 blocks if available
    if (files.ipv4File) {
      console.log(`Processing IPv4 blocks file: ${files.ipv4File}`);
      try {
        const ipv4Count = await this.processIpv4File(files.ipv4File);
        console.log(`Imported ${ipv4Count} IPv4 blocks`);
      } catch (error) {
        console.error(`Error processing IPv4 file: ${error.message}`);
      }
    }

    // Process IPv6 blocks if available
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
      let count = 0;
      fs.createReadStream(filePath)
        .pipe(csv())
        .on("data", (row) => {
          // Debug first few rows to verify data format
          if (count < 3) {
            console.debug(`Sample location row ${count}:`, row);
          }
          count++;

          // Store location data in memory map if it has a valid geoname_id
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
          console.log(`Processed ${count} location records`);
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
    let noLocationCount = 0;
    let noNetworkCount = 0;

    return new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(
          csv({
            // Explicitly set headers to match expected format
            headers: [
              "network",
              "geoname_id",
              "registered_country_geoname_id",
              "represented_country_geoname_id",
              "is_anonymous_proxy",
              "is_satellite_provider",
              "postal_code",
              "latitude",
              "longitude",
              "accuracy_radius",
              "is_anycast",
            ],
            skipLines: 0, // Don't skip any lines, our file has a header already
          })
        )
        .on("data", async (row) => {
          totalCount++;

          // Debug first few rows to verify data format
          if (totalCount < 3) {
            console.debug(`Sample IPv4 row ${totalCount}:`, row);
          }

          try {
            // Parse the network (e.g., 1.0.0.0/24)
            const network = row.network;
            if (!network) {
              noNetworkCount++;
              if (noNetworkCount < 5) {
                console.warn(
                  `IPv4 row missing network: ${JSON.stringify(row)}`
                );
              }
              return;
            }

            // Get the geoname_id, try to use various fallbacks
            const geonameId =
              row.geoname_id ||
              row.registered_country_geoname_id ||
              row.represented_country_geoname_id;

            if (!geonameId) {
              noLocationCount++;
              if (noLocationCount < 5) {
                console.warn(
                  `IPv4 row missing geoname_id: ${JSON.stringify(row)}`
                );
              }
              return;
            }

            const location = this.locationMap.get(geonameId);
            if (!location) {
              noLocationCount++;
              if (noLocationCount < 5) {
                console.warn(
                  `No location found for geoname_id ${geonameId} in IPv4 row`
                );
              }
              return; // Skip if no location data
            }

            // Parse CIDR notation
            const cidrParts = network.split("/");
            if (cidrParts.length !== 2) {
              if (errorCount < 5) {
                console.warn(`Invalid IPv4 CIDR format: ${network}`);
              }
              errorCount++;
              return;
            }

            const ip = cidrParts[0];
            const prefixStr = cidrParts[1];
            const prefix = parseInt(prefixStr, 10);

            if (
              !IpUtil.isValidIpv4(ip) ||
              isNaN(prefix) ||
              prefix < 0 ||
              prefix > 32
            ) {
              if (errorCount < 5) {
                console.warn(`Invalid IPv4 address or prefix: ${network}`);
              }
              errorCount++;
              return;
            }

            // Calculate IP range
            const ipLong = IpUtil.ipToLong(ip);
            const mask = ~((1 << (32 - prefix)) - 1);
            const startIp = ipLong & mask;
            const endIp = startIp | ~mask;

            // Store in Redis
            const key = `geoip:v4:range:${startIp}:${endIp}`;

            // Use pipeline to reduce Redis roundtrips
            const pipeline = redisClient.client.multi();

            pipeline.hSet(key, "countryCode", location.countryCode);
            pipeline.hSet(key, "country", location.country);
            pipeline.hSet(key, "state", location.state);
            pipeline.hSet(key, "city", location.city);
            pipeline.hSet(key, "startIp", IpUtil.longToIp(startIp));
            pipeline.hSet(key, "endIp", IpUtil.longToIp(endIp));

            // Add latitude/longitude if available
            if (row.latitude) pipeline.hSet(key, "latitude", row.latitude);
            if (row.longitude) pipeline.hSet(key, "longitude", row.longitude);

            // Create index for fast lookups
            pipeline.set(`geoip:v4:idx:${startIp}`, key);

            // Execute the pipeline
            await pipeline.exec();
            successCount++;

            // Provide progress updates
            if (successCount % 1000 === 0) {
              console.log(`Processed ${successCount} IPv4 blocks...`);
            }
          } catch (err) {
            errorCount++;
            if (errorCount < 10) {
              console.error(`Error processing IPv4 row ${totalCount}:`, err);
            } else if (errorCount === 10) {
              console.error(
                `Too many IPv4 errors, suppressing further error logs...`
              );
            }
          }
        })
        .on("end", () => {
          console.log(
            `IPv4 processing complete: ${totalCount} total, ${successCount} successful, ${errorCount} errors, ${noLocationCount} without location`
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
    let noLocationCount = 0;
    let noNetworkCount = 0;
    let skippedNetworks = 0;

    return new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(
          csv({
            // Explicitly set headers to match expected format
            headers: [
              "network",
              "geoname_id",
              "registered_country_geoname_id",
              "represented_country_geoname_id",
              "is_anonymous_proxy",
              "is_satellite_provider",
              "postal_code",
              "latitude",
              "longitude",
              "accuracy_radius",
              "is_anycast",
            ],
            skipLines: 0, // Don't skip any lines, our file has a header already
          })
        )
        .on("data", async (row) => {
          totalCount++;

          // Debug first few rows to verify data format
          if (totalCount < 3) {
            console.debug(`Sample IPv6 row ${totalCount}:`, row);
          }

          try {
            // Parse the network (e.g., 2001:200::/32)
            const network = row.network;
            if (!network) {
              noNetworkCount++;
              if (noNetworkCount < 5) {
                console.warn(
                  `IPv6 row missing network: ${JSON.stringify(row)}`
                );
              }
              return;
            }

            // Skip processing if we detect known problematic patterns
            if (network.includes("e680::") || network.includes("::::")) {
              console.warn(`Skipping problematic IPv6 network: ${network}`);
              skippedNetworks++;
              return;
            }

            // Get the geoname_id, try to use various fallbacks
            const geonameId =
              row.geoname_id ||
              row.registered_country_geoname_id ||
              row.represented_country_geoname_id;

            if (!geonameId) {
              noLocationCount++;
              if (noLocationCount < 5) {
                console.warn(
                  `IPv6 row missing geoname_id: ${JSON.stringify(row)}`
                );
              }
              return;
            }

            const location = this.locationMap.get(geonameId);
            if (!location) {
              noLocationCount++;
              if (noLocationCount < 5) {
                console.warn(
                  `No location found for geoname_id ${geonameId} in IPv6 row`
                );
              }
              return; // Skip if no location data
            }

            // Parse CIDR notation and handle potential errors
            try {
              // Split network into IP and prefix parts safely
              const parts = network.split("/");
              if (parts.length !== 2) {
                console.warn(`Invalid IPv6 CIDR format: ${network}`);
                return;
              }

              const ip = parts[0];
              const prefixStr = parts[1];
              const prefix = parseInt(prefixStr, 10);

              if (isNaN(prefix) || prefix < 0 || prefix > 128) {
                console.warn(`Invalid IPv6 prefix: ${prefixStr} in ${network}`);
                return;
              }

              // Normalize and validate IP format
              let normalizedIp;
              try {
                normalizedIp = IpUtil.normalizeIpv6(ip);
              } catch (err) {
                console.warn(
                  `Failed to normalize IPv6 address ${ip}: ${err.message}`
                );
                return;
              }

              // Calculate range with better error handling
              try {
                // Convert to BigInt with validation
                const ipBigInt = IpUtil.ipv6ToBigInt(normalizedIp);

                // Create masks using BigInt with bounds checking
                const maxBits = BigInt(128);
                const prefixBigInt = BigInt(prefix);

                // Avoid potential overflow by checking bounds
                if (prefixBigInt < 0 || prefixBigInt > 128) {
                  console.warn(
                    `Invalid IPv6 prefix (out of bounds): ${prefix}`
                  );
                  return;
                }

                // Calculate masks safely
                let mask;
                if (prefixBigInt === maxBits) {
                  mask = BigInt(0); // Special case for /128 networks
                } else {
                  const shiftAmount = maxBits - prefixBigInt;
                  if (shiftAmount > 100) {
                    // For very large shifts, be extra careful
                    mask = BigInt(2) ** shiftAmount - BigInt(1);
                  } else {
                    mask = (BigInt(1) << shiftAmount) - BigInt(1);
                  }
                }

                // Calculate range start and end
                const startIp = ipBigInt & ~mask;
                const endIp = ipBigInt | mask;

                // Convert back to string representation for verification
                const startIpStr = IpUtil.bigIntToIpv6(startIp);
                const endIpStr = IpUtil.bigIntToIpv6(endIp);

                // Verify the calculations are reasonable
                if (!startIpStr || !endIpStr) {
                  console.warn(
                    `Failed to convert BigInt to IPv6 string for ${network}`
                  );
                  return;
                }

                // Create Redis key with namespace for the range
                const key = `geoip:v6:range:${startIp}:${endIp}`;

                // Store limited data in Redis to avoid large values
                const locationData = {
                  countryCode: location.countryCode || "",
                  country: location.country || "",
                  state: location.state || "",
                  city: location.city || "",
                  startIp: startIpStr,
                  endIp: endIpStr,
                };

                // Use pipeline for better performance and atomic operations
                const pipeline = redisClient.client.multi();

                // Add each field one by one to avoid issues with complex objects
                pipeline.hSet(key, "countryCode", locationData.countryCode);
                pipeline.hSet(key, "country", locationData.country);
                pipeline.hSet(key, "state", locationData.state);
                pipeline.hSet(key, "city", locationData.city);
                pipeline.hSet(key, "startIp", locationData.startIp);
                pipeline.hSet(key, "endIp", locationData.endIp);

                // Optional: Add latitude/longitude if available
                if (row.latitude) pipeline.hSet(key, "latitude", row.latitude);
                if (row.longitude)
                  pipeline.hSet(key, "longitude", row.longitude);

                // Create index for fast lookups (using a more compact index key)
                pipeline.set(`geoip:v6:idx:${startIp.toString()}`, key);

                // Execute the pipeline
                await pipeline.exec();

                successCount++;
              } catch (err) {
                errorCount++;
                console.error(
                  `Error processing IPv6 range for ${network}:`,
                  err
                );
              }
            } catch (err) {
              errorCount++;
              console.error(`Error parsing IPv6 CIDR ${network}:`, err);
            }
          } catch (err) {
            errorCount++;
            if (errorCount < 10) {
              // Only log the first few errors to avoid flooding
              console.error(`Error processing IPv6 row:`, err);
            } else if (errorCount === 10) {
              console.error(`Suppressing further IPv6 processing errors...`);
            }
          }
        })
        .on("end", () => {
          console.log(
            `Processed IPv6 file: ${totalCount} total, ${successCount} successful, ${errorCount} errors, ${noLocationCount} without location, ${skippedNetworks} skipped networks`
          );
          resolve(successCount);
        })
        .on("error", (err) => {
          console.error(`Error reading IPv6 file:`, err);
          reject(err);
        });
    });
  }
}

// Export a singleton instance
export const csvImportService = new CsvImportService();
