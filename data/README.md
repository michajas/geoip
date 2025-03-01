# GeoIP Data Directory

This directory is where CSV files containing IP geolocation data should be placed.

## Required Files

The importer expects these file types:

1. **Dictionary/Location File** - Contains mappings of geoname_ids to location info  
   Format: `geoname_id,locale_code,continent_code,continent_name,country_iso_code,country_name,subdivision_1_iso_code,subdivision_1_name,subdivision_2_iso_code,subdivision_2_name,city_name,metro_code,time_zone,is_in_european_union`

2. **IPv4 Data File** - Contains IPv4 network ranges with geoname_ids  
   Format: `network,geoname_id,registered_country_geoname_id,represented_country_geoname_id,is_anonymous_proxy,is_satellite_provider,postal_code,latitude,longitude,accuracy_radius,is_anycast`

3. **IPv6 Data File** - Contains IPv6 network ranges with geoname_ids  
   Format: `network,geoname_id,registered_country_geoname_id,represented_country_geoname_id,is_anonymous_proxy,is_satellite_provider,postal_code,latitude,longitude,accuracy_radius,is_anycast`

## File Naming

The importer identifies files by these patterns:
- Dictionary file: Contains 'location', 'dict', or 'city' in the filename
- IPv6 file: Contains 'ipv6' or 'v6' in the filename
- All other CSV files are assumed to be IPv4 files

## Import Process

1. First, the dictionary file is loaded to create a mapping of geoname_ids to location data
2. Then the IP files are processed, linking each network range to its location via geoname_id
3. Only the country code, state, and city information is stored in Redis

## Automatic Import

Files in this directory will be automatically imported on application startup and
periodically based on the CSV_IMPORT_INTERVAL setting in your .env file.

## Manual Import

You can also manually trigger an import by running:

```bash
yarn import-data
```
