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

  try {
    // Execute the import script directly without building
    console.log("Running import script...");
    const importProcess = spawn(
      "node",
      [
        "-r",
        "./scripts/register-ts-paths.js",
        "./src/scripts/import-csv-direct.ts",
        ...args,
      ],
      {
        stdio: "inherit",
        shell: true,
      }
    );

    // Handle process completion
    importProcess.on("close", (code) => {
      process.exit(code);
    });
  } catch (error) {
    console.error("Failed to execute import:", error);
    process.exit(1);
  }
}

// Run the script
main().catch(console.error);
