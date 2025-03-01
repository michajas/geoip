import http from "k6/http";
import { sleep, check } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";
import { randomItem } from "https://jslib.k6.io/k6-utils/1.2.0/index.js";
import { URL } from "https://jslib.k6.io/url/1.0.0/index.js";

// Load the test IPs
const testIPs = JSON.parse(open("./test-ips.json"));

// Custom metrics
const successRate = new Rate("success_rate");
const notFoundRate = new Rate("not_found_rate");
const requestDuration = new Trend("request_duration");
const requestsPerSecond = new Rate("requests_per_second");
const totalRequests = new Counter("total_requests");

// Test configuration
export const options = {
  stages: [
    { duration: "5s", target: 10 }, // Ramp up to 10 users over 30 seconds
    { duration: "20s", target: 50 }, // Ramp up to 50 users over 1 minute
    { duration: "10s", target: 50 }, // Stay at 50 users for 2 minutes
    { duration: "5s", target: 0 }, // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ["p(95)<500"], // 95% of requests should complete within 500ms
    success_rate: ["rate>0.95"], // 95% of requests should be successful
    not_found_rate: ["rate<0.1"], // Less than 10% should return 404
    request_duration: ["p(95)<500"], // Track the custom request duration
  },
};

// Helper function to format a URL with query parameters
function formatUrl(baseUrl, queryParams) {
  const url = new URL(baseUrl);
  Object.entries(queryParams).forEach(([key, value]) => {
    url.searchParams.append(key, value);
  });
  return url.toString();
}

// Main test function
export default function () {
  // Get a random IP from the test set
  const testIp = randomItem(testIPs);

  // Prepare request
  const url = formatUrl("http://localhost:3001/api/geo", { ip: testIp });

  // Make the request and record start time
  const startTime = new Date();
  const response = http.get(url);

  // Calculate duration
  const duration = new Date() - startTime;

  // Record metrics
  requestDuration.add(duration);
  requestsPerSecond.add(1);
  totalRequests.add(1);

  // Check response
  const isSuccess = check(response, {
    "status is 200": (r) => r.status === 200,
    "response has data": (r) => r.json().hasOwnProperty("countryCode"),
  });

  // Track success/failure rates
  successRate.add(isSuccess);
  notFoundRate.add(response.status === 404 ? 1 : 0);

  // Log for debugging (only 1% of responses to avoid excessive logging)
  if (Math.random() < 0.01) {
    console.log(`[${response.status}] ${url} - ${duration}ms`);
    if (response.status === 200) {
      console.log(`Response: ${response.body}`);
    }
  }

  // Add some randomness to requests
  sleep(0.01 + Math.random() * 0.04); // Sleep between 10ms-50ms
}

// Summary output when the test completes
export function handleSummary(data) {
  console.log("Summary data:");
  console.log(`  Total requests: ${data.metrics.total_requests.values.count}`);
  console.log(
    `  Request rate: ${data.metrics.requests_per_second.values.rate.toFixed(
      2
    )}/sec`
  );
  console.log(
    `  Mean response time: ${data.metrics.http_req_duration.values.avg.toFixed(
      2
    )}ms`
  );
  console.log(
    `  95th percentile: ${data.metrics.http_req_duration.values[
      "p(95)"
    ].toFixed(2)}ms`
  );
  console.log(
    `  Success rate: ${(data.metrics.success_rate.values.rate * 100).toFixed(
      2
    )}%`
  );
  console.log(
    `  Not found rate: ${(
      data.metrics.not_found_rate.values.rate * 100
    ).toFixed(2)}%`
  );

  // Return an object with multiple summaries in different formats
  return {
    stdout: JSON.stringify(data), // Default summary to stdout
    "./load-tests/summary.json": JSON.stringify(data), // JSON summary
    "./load-tests/summary.txt": textSummary(data, {
      indent: " ",
      enableColors: false,
    }), // Text summary
  };
}

// Helper function to create a text summary
function textSummary(data, options) {
  const { http_req_duration, success_rate, not_found_rate } = data.metrics;

  return `
=================================
GeoIP Service Load Test Summary
=================================

Test duration: ${formatDuration(data.state.testRunDurationMs)}
Virtual users: ${options.vus || 50}

Request Metrics:
  Total requests: ${data.metrics.total_requests?.values.count || "N/A"}
  Requests/sec: ${
    data.metrics.requests_per_second?.values.rate.toFixed(2) || "N/A"
  }/sec
  
Response Time:
  Min: ${http_req_duration?.values.min.toFixed(2) || "N/A"}ms
  Mean: ${http_req_duration?.values.avg.toFixed(2) || "N/A"}ms
  Median: ${http_req_duration?.values["p(50)"]?.toFixed(2) || "N/A"}ms
  p90: ${http_req_duration?.values["p(90)"]?.toFixed(2) || "N/A"}ms
  p95: ${http_req_duration?.values["p(95)"]?.toFixed(2) || "N/A"}ms
  p99: ${http_req_duration?.values["p(99)"]?.toFixed(2) || "N/A"}ms
  Max: ${http_req_duration?.values.max.toFixed(2) || "N/A"}ms

Status Codes:
  200 OK: ${data.metrics.http_reqs?.values.rate || "N/A"}/sec
  Success rate: ${(success_rate?.values.rate * 100).toFixed(2) || "N/A"}%
  Not found rate: ${(not_found_rate?.values.rate * 100).toFixed(2) || "N/A"}%

=================================
  `;
}

// Helper to format duration
function formatDuration(ms) {
  let remaining = ms;
  const hours = Math.floor(remaining / 3600000);
  remaining %= 3600000;

  const minutes = Math.floor(remaining / 60000);
  remaining %= 60000;

  const seconds = Math.floor(remaining / 1000);

  return `${hours}h ${minutes}m ${seconds}s`;
}
