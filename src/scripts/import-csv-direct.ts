/**
 * Direct import script for CSV data
 */
import { CsvImportService } from "../services/csv-import-service";
import { redisClient } from "../services/redis-client";

// Parse command line arguments
function parseArgs(): { [key: string]: string | boolean } {
  const args: { [key: string]: string | boolean } = {
    clearExisting: false,
  };

  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--clear" || arg === "-c") {
      args.clearExisting = true;
      continue;
    }

    if (arg.startsWith("--")) {
      const key = arg.substring(2);
      const value = argv[++i];
      args[key] = value;
    } else if (arg.startsWith("-")) {
      const key = arg.substring(1);
      const value = argv[++i];

      switch (key) {
        case "l":
          args.locationsFile = value;
          break;
        case "4":
          args.ipv4File = value;
          break;
        case "6":
          args.ipv6File = value;
          break;
        case "d":
          args.dataDir = value;
          break;
        default:
          args[key] = value;
      }
    }
  }

  return args;
}

// Main import function
async function runImport() {
  try {
    // Parse arguments
    const args = parseArgs();

    // Register shutdown handlers
    let shuttingDown = false;
    process.on("SIGINT", handleShutdown);
    process.on("SIGTERM", handleShutdown);

    async function handleShutdown() {
      if (shuttingDown) return;
      shuttingDown = true;

      try {
        if (redisClient.isConnected()) {
          await redisClient.disconnect();
        }
      } catch (e) {
        // Ignore errors during shutdown
      }
      process.exit(0);
    }

    // Run the import
    await new CsvImportService().importData({
      locationsFile: args.locationsFile as string | undefined,
      ipv4File: args.ipv4File as string | undefined,
      ipv6File: args.ipv6File as string | undefined,
      dataDir: args.dataDir as string | undefined,
      clearExisting: args.clearExisting as boolean,
    });

    // Cleanup and exit
    if (!shuttingDown && redisClient.isConnected()) {
      await redisClient.disconnect();
    }
    process.exit(0);
  } catch (error) {
    console.error("Error during import:", error);

    try {
      if (redisClient.isConnected()) {
        await redisClient.disconnect();
      }
    } catch (e) {
      // Ignore errors during error cleanup
    }
    process.exit(1);
  }
}

// Run the import
runImport().catch(() => process.exit(1));
