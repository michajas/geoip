#!/usr/bin/env node

/**
 * Direct import script for GeoIP CSV data
 * This script avoids TypeScript compilation issues by directly requiring the necessary modules
 */
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

// Main function
async function main() {
  // Get command line arguments
  const args = process.argv.slice(2);

  // Build the project
  console.log("Building project...");
  await buildProject();

  try {
    // Create paths to the compiled modules
    const csvImportPath = path.resolve(
      __dirname,
      "../dist/services/csv-import-service.js"
    );
    const redisClientPath = path.resolve(
      __dirname,
      "../dist/services/redis-client.js"
    );

    // Check if the compiled modules exist
    if (!fs.existsSync(csvImportPath)) {
      throw new Error(`CSV import service not found at: ${csvImportPath}`);
    }

    // Create a new script to execute with correct imports
    const tempScriptPath = path.resolve(__dirname, ".temp-import.js");

    const scriptContent = `
    const { csvImportService } = require('${csvImportPath.replace(
      /\\/g,
      "\\\\"
    )}');
    const { redisClient } = require('${redisClientPath.replace(
      /\\/g,
      "\\\\"
    )}');
    const path = require('path');
    
    async function run() {
      try {
        // Parse args
        const args = {};
        const cliArgs = process.argv.slice(2);
        
        for (let i = 0; i < cliArgs.length; i++) {
          const arg = cliArgs[i];
          
          if (arg === '--clear' || arg === '-c') {
            args.clearExisting = true;
            continue;
          }
          
          if (!arg.startsWith('-')) continue;
          
          const value = cliArgs[++i];
          if (!value || value.startsWith('-')) continue;
          
          if (arg === '-l' || arg === '--locations') {
            args.locationsFile = path.resolve(process.cwd(), value);
          } else if (arg === '-4' || arg === '--ipv4') {
            args.ipv4File = path.resolve(process.cwd(), value);
          } else if (arg === '-6' || arg === '--ipv6') {
            args.ipv6File = path.resolve(process.cwd(), value);
          } else if (arg === '-d' || arg === '--dir') {
            args.dataDir = path.resolve(process.cwd(), value);
          }
        }
        
        try {
          console.log('Import options:', args);
          
          // Add a special check for IPv6 files
          if (args.ipv6File) {
            console.log('WARNING: IPv6 processing may encounter issues with certain address formats.');
            console.log('         Some addresses may be skipped for stability.');
          }
          
          // Set a longer timeout to prevent Node from terminating on long operations
          const originalTimeout = setTimeout(() => {}, 1000000);
          clearTimeout(originalTimeout);
          
          // Run the import with error handling
          await csvImportService.importData(args);
          
          // Close Redis connection properly with a delay to ensure all operations complete
          console.log('Import completed, closing connections...');
          setTimeout(async () => {
            try {
              await redisClient.disconnect();
              console.log('Redis connection closed cleanly');
              process.exit(0);
            } catch (err) {
              console.error('Error during Redis disconnect:', err);
              process.exit(1);
            }
          }, 1000);
        } catch (error) {
          console.error('Error during import:', error);
          try {
            await redisClient.disconnect();
          } catch (disconnectError) {
            console.error('Additionally, error during Redis disconnect:', disconnectError);
          }
          process.exit(1);
        }
      } catch (error) {
        console.error('Script error:', error);
        process.exit(1);
      }
    }
    
    run().catch(console.error);
    `;

    fs.writeFileSync(tempScriptPath, scriptContent);

    // Execute the temp script with the same arguments
    console.log("Running import script...");
    const importProcess = spawn("node", [tempScriptPath, ...args], {
      stdio: "inherit",
      shell: true,
    });

    // Handle process completion
    importProcess.on("close", (code) => {
      // Clean up temp file
      try {
        fs.unlinkSync(tempScriptPath);
      } catch (err) {}

      process.exit(code);
    });
  } catch (error) {
    console.error("Failed to execute import:", error);
    process.exit(1);
  }
}

// Helper to build the project
async function buildProject() {
  return new Promise((resolve, reject) => {
    const build = spawn("yarn", ["build"], { stdio: "inherit", shell: true });

    build.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Build failed with code ${code}`));
      }
    });
  });
}

// Run the script
main().catch(console.error);
