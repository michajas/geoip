# GeoIP Service

A Node.js REST API service that provides geolocation data based on IP addresses.

## Features

- REST API for IP geolocation lookups (IPv4 and IPv6)
- Parsing of CSV files with IP and location data
- Redis-backed data storage for fast lookups
- Support for both IPv4 and IPv6 addresses

## Getting Started

### Prerequisites

- Node.js 14+ and Yarn
- Docker and Docker Compose (for Redis)

### Installation

```bash
# Clone the repository
git clone /path/to/geoip.git
cd geoip

# Install dependencies
yarn install

# Start Redis
docker-compose up -d redis

# Build the application
yarn build
```

### Environment Variables

Create a `.env` file with:

```
PORT=3001                    # Server port
REDIS_HOST=localhost         # Redis host
REDIS_PORT=6379              # Redis port
CSV_IMPORT_INTERVAL=86400000 # Data import interval (ms)
```

### Running the Application

```bash
# Start the server
yarn start

# Development mode with auto-reload
yarn dev
```

## Docker Deployment

```bash
# Build and start the application
docker-compose up -d

# View logs
docker-compose logs -f
```

## Data Import

Place your CSV files in the `data/` directory:
1. **Dictionary/Location File**: Maps geoname_ids to location data
2. **IPv4 Data File**: Contains IPv4 network ranges with geoname_ids
3. **IPv6 Data File**: Contains IPv6 network ranges with geoname_ids

### Manual Import

```bash
# Import data from CSV files to Redis
yarn import-data
```

## API Usage

```
GET /api/geo?ip=192.168.1.1
```

Response:
```json
{
  "ip": "192.168.1.1",
  "ipVersion": 4,
  "countryCode": "US",
  "state": "California",
  "city": "San Francisco"
}
```

## Testing

```bash
# Run unit tests
yarn test

# Run E2E tests
yarn test:e2e
```

## Load Testing

```bash
# Extract test IPs from CSV
yarn extract-test-ips

# Run K6 load test
yarn load-test
```
