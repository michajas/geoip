const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");

// Path to the IPv4 CSV file
const csvFilePath = path.resolve(__dirname, "../GeoIP2-City-Blocks-IPv4.csv");
const outputFilePath = path.resolve(__dirname, "./test-ips.json");

// Function to extract the first IP address from a CIDR notation
function extractIpFromCidr(cidr) {
  if (!cidr) return null;
  return cidr.split("/")[0];
}

// Array to store extracted IPs
const ipAddresses = [];

// Read and parse the CSV file
fs.createReadStream(csvFilePath)
  .pipe(csv())
  .on("data", (row) => {
    const ip = extractIpFromCidr(row.network);
    if (ip) {
      ipAddresses.push(ip);
    }
  })
  .on("end", () => {
    // Write the IPs to a JSON file for the k6 test to use
    fs.writeFileSync(outputFilePath, JSON.stringify(ipAddresses, null, 2));
    console.log(
      `Extracted ${ipAddresses.length} IP addresses to ${outputFilePath}`
    );
  })
  .on("error", (error) => {
    console.error("Error processing CSV:", error);
  });
