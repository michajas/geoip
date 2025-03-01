# GeoIP Service

A high-performance IP geolocation service that provides location data based on IP addresses. This service leverages Redis for fast lookups and supports both IPv4 and IPv6 addresses.

## Features

- Fast IP address lookups via Redis
- Support for IPv4 and IPv6 addresses
- CSV data import for MaxMind GeoIP2 City databases
- REST API for geolocation queries
- Docker containerization for easy deployment
- Load testing capabilities

## Getting Started

### Prerequisites

- Node.js 18+
- Yarn package manager
- Redis server
- Docker & Docker Compose (optional)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/geoip.git
   cd geoip
   ```

2. Install dependencies:
   ```bash
   yarn install
   ```

3. Build the project:
   ```bash
   yarn build:all
   ```

4. Start Redis (if not using Docker):
   ```bash
   # Install and run Redis on your system
   # For example, on Ubuntu:
   # sudo apt-get install redis-server
   # sudo systemctl start redis
   ```

5. Import GeoIP data:
   ```bash
   yarn update-geoip -l GeoIP2-City-Locations-en.csv -4 GeoIP2-City-Blocks-IPv4.csv -6 GeoIP2-City-Blocks-IPv6.csv
   ```

6. Start the service:
   ```bash
   yarn start
   ```

## Development

Start the development server with auto-reload:
```bash
yarn dev
```

### Available Scripts

| Command | Description |
|---------|-------------|
| `yarn build` | Build the source code |
| `yarn build:scripts` | Build the scripts |
| `yarn build:all` | Build both source and scripts |
| `yarn start` | Start the production server |
| `yarn dev` | Start the development server with auto-reload |
| `yarn test` | Run unit tests |
| `yarn test:e2e` | Run end-to-end integration tests |
| `yarn lint` | Run ESLint to check for code quality issues |
| `yarn import-csv` | Import CSV data (TypeScript version) |
| `yarn import-data` | Import GeoIP data from CSV files |
| `yarn import-full` | Import GeoIP data from CSV files after clearing existing data |
| `yarn update-geoip` | Import data from specific GeoIP2 City files |
| `yarn clear-redis` | Clear all data from Redis |
| `yarn check-redis` | Check data stored in Redis |
| `yarn test-ip <ip>` | Test IP lookup directly against Redis |
| `yarn check-deps` | Check for circular dependencies |
| `yarn extract-test-ips` | Extract IPs from CSV for load testing |
| `yarn load-test` | Run k6 load tests |

## Data Import

The service requires GeoIP data to function. Use the import scripts to load this data into Redis:

```bash
# Basic import
yarn import-data -l GeoIP2-City-Locations-en.csv -4 GeoIP2-City-Blocks-IPv4.csv -6 GeoIP2-City-Blocks-IPv6.csv

# Clear existing data first, then import
yarn import-full -l GeoIP2-City-Locations-en.csv -4 GeoIP2-City-Blocks-IPv4.csv

# Using shorthand command for standard MaxMind files
yarn update-geoip
```

### Expected CSV Formats

1. **Locations file** (GeoIP2-City-Locations-en.csv):
   - Contains: geoname_id, locale_code, continent_code, country_iso_code, country_name, subdivision_1_name, city_name, etc.

2. **IPv4 file** (GeoIP2-City-Blocks-IPv4.csv):
   - Contains: network, geoname_id, latitude, longitude, etc.

3. **IPv6 file** (GeoIP2-City-Blocks-IPv6.csv):
   - Similar format to IPv4 file but with IPv6 networks

## API Usage

### Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/geo?ip={ip_address}` | GET | Get location data for an IP address |
| `/api/geo/debug` | GET | Get debug information about Redis data |
| `/health` | GET | Health check endpoint |

### Examples

```bash
# Get location for an IP
curl http://localhost:3001/api/geo?ip=149.101.100.1

# Check server health
curl http://localhost:3001/health
```

Sample response:
```json
{
  "ip": "149.101.100.1",
  "ipVersion": 4,
  "countryCode": "US",
  "country": "United States",
  "state": "",
  "city": "",
  "latitude": "37.7510",
  "longitude": "-97.8220"
}
```

## Docker Deployment

1. Build and run using Docker Compose:
   ```bash
   docker-compose up -d
   ```

2. Import data into the containerized service:
   ```bash
   docker-compose exec geoip yarn import-data -l /app/data/GeoIP2-City-Locations-en.csv -4 /app/data/GeoIP2-City-Blocks-IPv4.csv
   ```

## Troubleshooting

### Testing a Specific IP

Use the test-ip script to check how a specific IP is being processed:

```bash
yarn test-ip 149.101.100.1
```

### Checking Redis Data

To examine what's stored in Redis:

```bash
yarn check-redis
```

### Common Issues

1. **Missing data for specific IPs**: 
   - Check if the IP falls within any of the imported ranges
   - Verify that IP range calculation is working correctly

2. **Redis connection issues**:
   - Verify Redis is running: `redis-cli ping`
   - Check connectivity: `redis-cli -h localhost -p 6379`

3. **Import failures**:
   - Check CSV format matches expected structure
   - Ensure appropriate permissions for data files

## Performance Testing

Extract test IPs and run load tests:

```bash
yarn extract-test-ips
yarn load-test
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.
