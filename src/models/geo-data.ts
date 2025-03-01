/**
 * Interface representing raw geolocation data from CSV
 */
export interface GeoIpData {
  ipStart: string;
  ipEnd: string;
  countryCode: string;
  state: string;
  city: string;
  ipVersion?: 4 | 6;
}

/**
 * Interface representing the result of a geolocation lookup
 */
export interface GeoLookupResult {
  ip: string;
  ipVersion: 4 | 6;
  countryCode: string | null;
  state: string | null;
  city: string | null;
}

/**
 * Interface for dictionary entry mapping
 */
export interface LocationEntry {
  geonameId: string;
  countryCode: string;
  state: string;
  city: string;
}
