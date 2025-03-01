import path from "path";
// Fix import path to properly resolve after compilation
import { csvImportService } from "../src/services/csv-import-service";
import { redisClient } from "../src/services/redis-client";

// Parse command line arguments
function parseArgs(): { [key: string]: string | boolean } {
  const args: { [key: string]: string | boolean } = {
    clear: false,
  };

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];

    if (arg === "--clear" || arg === "-c") {
      args.clear = true;
      continue;
    }

    if (arg.startsWith("--")) {
      const key = arg.substring(2);
      const value = process.argv[++i];
      args[key] = value;
    } else if (arg.startsWith("-")) {
      const key = arg.substring(1);
      const value = process.argv[++i];

      // Map short options to long options
      switch (key) {
        case "l":
          args.locations = value;
          break;
        case "4":
          args.ipv4 = value;
          break;
        case "6":
          args.ipv6 = value;
          break;
        case "d":
          args.dir = value;
          break;
        default:
          args[key] = value;
      }
    }
  }

  return args;
}

// Print usage information
function printUsage(): void {
  console.log("Usage: yarn import-csv [options]");
  console.log("");
  console.log("Options:");
  console.log(
    "  --locations, -l <file>   Path to GeoIP2-City-Locations-en.csv"
  );
  console.log("  --ipv4, -4 <file>        Path to GeoIP2-City-Blocks-IPv4.csv");
  console.log("  --ipv6, -6 <file>        Path to GeoIP2-City-Blocks-IPv6.csv");
  console.log("  --dir, -d <directory>    Directory containing CSV files");
  console.log("  --clear, -c             Clear existing GeoIP data from Redis");
  console.log("");
  console.log("Example:");
  console.log(
    "  yarn import-csv -l GeoIP2-City-Locations-en.csv -4 GeoIP2-City-Blocks-IPv4.csv"
  );
}

// Main function
async function main() {
  // Parse arguments
  const args = parseArgs();

  if (args.help || args.h) {
    printUsage();
    process.exit(0);
  }

  try {
    // Prepare options
    const options = {
      locationsFile: args.locations as string | undefined,
      ipv4File: args.ipv4 as string | undefined,
      ipv6File: args.ipv6 as string | undefined,
      dataDir: args.dir as string | undefined,
      clearExisting: args.clear as boolean,
    };

    // Resolve paths if not absolute
    if (options.locationsFile && !path.isAbsolute(options.locationsFile)) {
      options.locationsFile = path.resolve(
        process.cwd(),
        options.locationsFile
      );
    }

    if (options.ipv4File && !path.isAbsolute(options.ipv4File)) {
      options.ipv4File = path.resolve(process.cwd(), options.ipv4File);
    }

    if (options.ipv6File && !path.isAbsolute(options.ipv6File)) {
      options.ipv6File = path.resolve(process.cwd(), options.ipv6File);
    }

    if (options.dataDir && !path.isAbsolute(options.dataDir)) {
      options.dataDir = path.resolve(process.cwd(), options.dataDir);
    }

    // Import the data
    await csvImportService.importData(options);

    // Close Redis connection
    await redisClient.disconnect();
    console.log("Import completed successfully");
    process.exit(0);
  } catch (error) {
    console.error("Error importing data:", error);
    await redisClient.disconnect();
    process.exit(1);
  }
}

// Run the script
main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
