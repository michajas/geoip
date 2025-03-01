import fs from "fs";
import path from "path";
import csv from "csv-parser";
import { redisClient } from "./redis-client";
import { IpUtil } from "./ip-util";
import { GeoIpData } from "../models/geo-data";
import dotenv from "dotenv";

dotenv.config();

// Configuration
const CSV_DIRECTORY = path.resolve(process.cwd(), "data");
const IMPORT_INTERVAL = parseInt(
  process.env.CSV_IMPORT_INTERVAL || "86400000",
  10
); // Default: once per day

// File specification interface
interface FileSpecification {
  dictionary?: string;
  ipv4?: string;
  ipv6?: string;
}

// Interface for location dictionary data
interface LocationDictionary {
  [geonameId: string]: {
    countryCode: string;
    state: string;
    city: string;
  };
}

/**
 * Parse the dictionary file to create a mapping of geoname_id to location data
 */
const loadLocationDictionary = async (
  filePath: string
): Promise<LocationDictionary> => {
  return new Promise((resolve, reject) => {
    const dictionary: LocationDictionary = {};

    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (data) => {
        const geonameId = data.geoname_id;
        if (geonameId) {
          dictionary[geonameId] = {
            countryCode: data.country_iso_code || "",
            state: data.subdivision_1_name || "",
            city: data.city_name || "",
          };
        }
      })
      .on("end", () => {
        console.log(
          `Loaded dictionary with ${Object.keys(dictionary).length} locations`
        );
        resolve(dictionary);
      })
      .on("error", (error) => {
        reject(error);
      });
  });
};

/**
 * Parse IP network string to extract start and end IPs
 * Format examples:
 * IPv4: "1.0.0.0/24"
 * IPv6: "2001:200::/32"
 */
const parseNetworkRange = (
  network: string
): { start: string; end: string; version: 4 | 6 } | null => {
  try {
    // Split network into IP and prefix
    const [ip, prefixStr] = network.split("/");
    const prefix = parseInt(prefixStr, 10);

    // Determine IP version
    const version = IpUtil.getIpVersion(ip);
    if (!version || isNaN(prefix)) {
      return null;
    }

    if (version === 4) {
      // Calculate the start and end of the IPv4 range
      const ipLong = IpUtil.ipToLong(ip);
      const mask = ~((1 << (32 - prefix)) - 1);
      const startIp = ipLong & mask;
      const endIp = startIp | ~mask;

      return {
        start: IpUtil.longToIp(startIp),
        end: IpUtil.longToIp(endIp),
        version: 4,
      };
    } else {
      // IPv6
      // For IPv6, we'll use the normalized forms
      const normalizedIp = IpUtil.normalizeIpv6(ip);
      const ipBigInt = IpUtil.ipv6ToBigInt(normalizedIp);

      // Create masks using BigInt
      const maxBits = BigInt(128);
      const prefixBigInt = BigInt(prefix);
      const mask = (BigInt(1) << (maxBits - prefixBigInt)) - BigInt(1);
      const startIp = ipBigInt & ~mask;
      const endIp = ipBigInt | mask;

      return {
        start: IpUtil.bigIntToIpv6(startIp),
        end: IpUtil.bigIntToIpv6(endIp),
        version: 6,
      };
    }
  } catch (error) {
    console.error(`Error parsing network range: ${network}`, error);
    return null;
  }
};

/**
 * Parse an IP file (IPv4 or IPv6) and return the data
 */
const parseIpFile = async (
  filePath: string,
  locationDictionary: LocationDictionary
): Promise<GeoIpData[]> => {
  return new Promise((resolve, reject) => {
    const results: GeoIpData[] = [];

    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (data) => {
        // Get location data from dictionary using geoname_id
        const geonameId = data.geoname_id;
        const locationData = geonameId ? locationDictionary[geonameId] : null;

        if (!locationData) {
          // Skip entries with no location data
          return;
        }

        // Parse the network range
        const network = data.network;
        const range = network ? parseNetworkRange(network) : null;

        if (!range) {
          // Skip entries with invalid network ranges
          return;
        }

        // Create GeoIpData record
        const geoData: GeoIpData = {
          ipStart: range.start,
          ipEnd: range.end,
          countryCode: locationData.countryCode,
          state: locationData.state,
          city: locationData.city,
          ipVersion: range.version,
        };

        // Only add entries with at least country code
        if (geoData.countryCode) {
          results.push(geoData);
        }
      })
      .on("end", () => {
        resolve(results);
      })
      .on("error", (error) => {
        reject(error);
      });
  });
};

/**
 * Store a batch of geolocation data in Redis
 */
const storeDataBatch = async (data: GeoIpData[]): Promise<void> => {
  console.log(`Storing batch of ${data.length} records in Redis...`);

  // Group by IP version for processing
  const ipv4Data = data.filter((item) => item.ipVersion === 4);
  const ipv6Data = data.filter((item) => item.ipVersion === 6);

  // Process in smaller batches to avoid overloading Redis
  const BATCH_SIZE = 1000;

  // Process IPv4 data
  for (let i = 0; i < ipv4Data.length; i += BATCH_SIZE) {
    const batch = ipv4Data.slice(i, i + BATCH_SIZE);

    for (const item of batch) {
      const ipStartLong = IpUtil.ipToLong(item.ipStart);
      const ipEndLong = IpUtil.ipToLong(item.ipEnd);

      // Store by range for easy lookups
      const key = `geoip:v4:range:${ipStartLong}:${ipEndLong}`;

      await redisClient.hSet(key, "countryCode", item.countryCode);
      await redisClient.hSet(key, "state", item.state || "");
      await redisClient.hSet(key, "city", item.city || "");

      // Also store range boundaries for querying
      await redisClient.hSet(key, "startIp", item.ipStart);
      await redisClient.hSet(key, "endIp", item.ipEnd);

      // Create index for fast lookup
      await redisClient.set(`geoip:v4:idx:${ipStartLong}`, key);
    }

    console.log(
      `Stored ${batch.length} IPv4 records (batch ${
        Math.floor(i / BATCH_SIZE) + 1
      } of ${Math.ceil(ipv4Data.length / BATCH_SIZE)})`
    );
  }

  // Process IPv6 data
  for (let i = 0; i < ipv6Data.length; i += BATCH_SIZE) {
    const batch = ipv6Data.slice(i, i + BATCH_SIZE);

    for (const item of batch) {
      // Convert IPv6 to BigInt for range storage
      const ipStartBigInt = IpUtil.ipv6ToBigInt(item.ipStart);
      const ipEndBigInt = IpUtil.ipv6ToBigInt(item.ipEnd);

      // Store using a different prefix for IPv6
      const key = `geoip:v6:range:${ipStartBigInt}:${ipEndBigInt}`;

      await redisClient.hSet(key, "countryCode", item.countryCode);
      await redisClient.hSet(key, "state", item.state || "");
      await redisClient.hSet(key, "city", item.city || "");

      // Also store range boundaries for reference
      await redisClient.hSet(key, "startIp", item.ipStart);
      await redisClient.hSet(key, "endIp", item.ipEnd);

      // Store index reference
      await redisClient.set(`geoip:v6:idx:${ipStartBigInt.toString()}`, key);
    }

    console.log(
      `Stored ${batch.length} IPv6 records (batch ${
        Math.floor(i / BATCH_SIZE) + 1
      } of ${Math.ceil(ipv6Data.length / BATCH_SIZE)})`
    );
  }
};

/**
 * Process all CSV files in the configured directory or use specified files
 */
export const importCsvToRedis = async (
  fileSpec?: FileSpecification
): Promise<void> => {
  console.log("Starting CSV import process...");

  try {
    // Check if specific files were provided
    if (fileSpec && Object.keys(fileSpec).length > 0) {
      return await importSpecifiedFiles(fileSpec);
    }

    // Otherwise, use the default directory-based approach
    return await importFilesFromDirectory();
  } catch (error) {
    console.error("Error during CSV import process:", error);
  }
};

/**
 * Import from specified files
 */
const importSpecifiedFiles = async (
  fileSpec: FileSpecification
): Promise<void> => {
  try {
    // First, we need the dictionary file
    if (!fileSpec.dictionary || !fs.existsSync(fileSpec.dictionary)) {
      console.error("Dictionary file not found or not specified.");
      return;
    }

    console.log(`Loading location dictionary from ${fileSpec.dictionary}...`);
    const dictionary = await loadLocationDictionary(fileSpec.dictionary);

    // Process IPv4 file if provided
    if (fileSpec.ipv4 && fs.existsSync(fileSpec.ipv4)) {
      console.log(`Processing IPv4 file: ${fileSpec.ipv4}`);
      const data = await parseIpFile(fileSpec.ipv4, dictionary);
      console.log(`Parsed ${data.length} valid records from IPv4 file`);

      if (data.length > 0) {
        await storeDataBatch(data);
        console.log(`Successfully imported data from IPv4 file`);
      }
    }

    // Process IPv6 file if provided
    if (fileSpec.ipv6 && fs.existsSync(fileSpec.ipv6)) {
      console.log(`Processing IPv6 file: ${fileSpec.ipv6}`);
      const data = await parseIpFile(fileSpec.ipv6, dictionary);
      console.log(`Parsed ${data.length} valid records from IPv6 file`);

      if (data.length > 0) {
        await storeDataBatch(data);
        console.log(`Successfully imported data from IPv6 file`);
      }
    }

    console.log("Import from specified files completed.");
  } catch (error) {
    console.error("Error importing from specified files:", error);
    throw error;
  }
};

/**
 * Import files from the configured directory
 */
const importFilesFromDirectory = async (): Promise<void> => {
  try {
    // Ensure the data directory exists
    if (!fs.existsSync(CSV_DIRECTORY)) {
      console.log(`Creating data directory: ${CSV_DIRECTORY}`);
      fs.mkdirSync(CSV_DIRECTORY, { recursive: true });
    }

    // Get all CSV files in the directory
    const files = fs
      .readdirSync(CSV_DIRECTORY)
      .filter((file) => file.endsWith(".csv"));

    if (files.length === 0) {
      console.log("No CSV files found in the data directory.");
      return;
    }

    console.log(`Found ${files.length} CSV files to process.`);

    // First, look for and load the location dictionary
    const dictionaryFile = files.find(
      (file) =>
        file.toLowerCase().includes("location") ||
        file.toLowerCase().includes("dict") ||
        file.toLowerCase().includes("city")
    );

    if (!dictionaryFile) {
      console.error("No dictionary file found. Unable to proceed with import.");
      return;
    }

    console.log(`Loading location dictionary from ${dictionaryFile}...`);
    const dictionary = await loadLocationDictionary(
      path.join(CSV_DIRECTORY, dictionaryFile)
    );

    // Process IP files
    for (const file of files) {
      // Skip the dictionary file
      if (file === dictionaryFile) continue;

      const filePath = path.join(CSV_DIRECTORY, file);
      console.log(`Processing file: ${file}`);

      try {
        // Determine if IPv4 or IPv6 based on filename
        const isIpv6 =
          file.toLowerCase().includes("ipv6") ||
          file.toLowerCase().includes("v6");
        console.log(`Detected as ${isIpv6 ? "IPv6" : "IPv4"} file`);

        const data = await parseIpFile(filePath, dictionary);
        console.log(`Parsed ${data.length} valid records from ${file}`);

        if (data.length > 0) {
          await storeDataBatch(data);
          console.log(`Successfully imported data from ${file}`);
        }
      } catch (error) {
        console.error(`Error processing file ${file}:`, error);
      }
    }

    console.log("CSV import process completed.");
  } catch (error) {
    console.error("Error during directory import process:", error);
    throw error;
  }
};

/**
 * Setup periodic data import
 */
export const setupDataImport = (): void => {
  // Run import on startup
  importCsvToRedis().catch((error) => {
    console.error("Failed to import data on startup:", error);
  });

  // Schedule periodic imports
  const intervalMinutes = IMPORT_INTERVAL / 60000;
  console.log(`Scheduled next import in ${intervalMinutes} minutes`);

  setInterval(() => {
    importCsvToRedis().catch((error) => {
      console.error("Failed to import data during scheduled import:", error);
    });
  }, IMPORT_INTERVAL);
};
