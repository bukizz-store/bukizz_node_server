import { logger } from "./logger.js";
import { getSupabase } from "../db/index.js";

/**
 * Distance Calculation Utility
 * Calculates distance between two locations using the Haversine formula.
 * Fallback chain: Haversine (lat/lng) → Geocoding → Pincode lookup → Static default
 */

const EARTH_RADIUS_KM = 6371;
const DEFAULT_FALLBACK_DISTANCE_KM = 2.0;

/**
 * Convert degrees to radians
 */
function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

/**
 * Haversine formula — returns distance in kilometers between two coordinate pairs.
 * @param {number} lat1
 * @param {number} lng1
 * @param {number} lat2
 * @param {number} lng2
 * @returns {number} Distance in km (rounded to 2 decimal places)
 */
export function haversineDistance(lat1, lng1, lat2, lng2) {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return parseFloat((EARTH_RADIUS_KM * c).toFixed(2));
}

/**
 * Mock geocoding — simulates an external API call (Google Maps / Mapbox)
 * to resolve an address string into coordinates.
 *
 * In production, replace the body with an actual HTTP call:
 *   const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(addressString)}&key=${API_KEY}`);
 *
 * @param {string} addressString
 * @returns {Promise<{lat: number, lng: number} | null>}
 */
async function mockGeocode(addressString) {
  try {
    logger.info("Mock geocoding address (replace with real API in production)", {
      address: addressString,
    });
    // Simulate network latency
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Return null to indicate geocoding could not resolve — triggers fallback
    return null;
  } catch (err) {
    logger.warn("Geocoding failed", { address: addressString, error: err.message });
    return null;
  }
}

/**
 * Look up approximate coordinates for a pincode by querying the addresses table
 * for any existing address with that postal_code that has valid lat/lng.
 *
 * @param {string} pincode - 6-digit Indian pincode
 * @returns {Promise<{lat: number, lng: number} | null>}
 */
async function lookupPincodeCoordinates(pincode) {
  if (!pincode || !/^\d{4,6}$/.test(String(pincode).trim())) return null;

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("addresses")
      .select("lat, lng")
      .eq("postal_code", String(pincode).trim())
      .not("lat", "is", null)
      .not("lng", "is", null)
      .limit(1);

    if (error || !data || data.length === 0) return null;

    const lat = parseFloat(data[0].lat);
    const lng = parseFloat(data[0].lng);
    if (isFinite(lat) && isFinite(lng)) {
      logger.info("Pincode coordinates resolved from addresses table", { pincode, lat, lng });
      return { lat, lng };
    }
    return null;
  } catch (err) {
    logger.warn("Pincode coordinate lookup failed", { pincode, error: err.message });
    return null;
  }
}

/**
 * India Post pincode zone → approximate centroid coordinates.
 * First digit of a 6-digit pincode identifies the postal zone.
 * These are rough centroids useful for fallback distance estimation.
 */
const PINCODE_ZONE_CENTROIDS = {
  "1": { lat: 28.65, lng: 77.23 },  // Delhi, Haryana, Punjab, HP, J&K
  "2": { lat: 26.85, lng: 80.95 },  // Uttar Pradesh, Uttarakhand
  "3": { lat: 23.25, lng: 72.63 },  // Rajasthan, Gujarat
  "4": { lat: 19.08, lng: 75.71 },  // Maharashtra, Goa
  "5": { lat: 15.91, lng: 79.74 },  // Andhra Pradesh, Telangana, Karnataka
  "6": { lat: 10.85, lng: 76.27 },  // Tamil Nadu, Kerala
  "7": { lat: 22.57, lng: 88.36 },  // West Bengal, Odisha, NE states
  "8": { lat: 22.97, lng: 87.85 },  // Bihar, Jharkhand
  "9": { lat: 11.00, lng: 76.97 },  // Army Post Office / field post
};

/**
 * Estimate distance between two pincodes using zone centroids.
 * If both pincodes are in the same zone, use a conservative local estimate.
 * If different zones, use Haversine between zone centroids.
 *
 * @param {string} pincode1
 * @param {string} pincode2
 * @returns {number|null} Estimated distance in km, or null if pincodes invalid
 */
function estimateDistanceFromPincodes(pincode1, pincode2) {
  const p1 = String(pincode1 || "").trim();
  const p2 = String(pincode2 || "").trim();

  if (p1.length < 1 || p2.length < 1) return null;

  const zone1 = PINCODE_ZONE_CENTROIDS[p1[0]];
  const zone2 = PINCODE_ZONE_CENTROIDS[p2[0]];

  if (!zone1 || !zone2) return null;

  // Same pincode → very local
  if (p1 === p2) return 3.0;

  // Same first 3 digits → same district/area
  if (p1.length >= 3 && p2.length >= 3 && p1.substring(0, 3) === p2.substring(0, 3)) {
    return 5.0;
  }

  // Same first 2 digits → same sub-region
  if (p1.length >= 2 && p2.length >= 2 && p1.substring(0, 2) === p2.substring(0, 2)) {
    return 15.0;
  }

  // Same zone (first digit) → same state/region
  if (p1[0] === p2[0]) {
    return 50.0;
  }

  // Different zones → use Haversine between zone centroids
  return haversineDistance(zone1.lat, zone1.lng, zone2.lat, zone2.lng);
}

/**
 * Calculate delivery distance between warehouse and customer locations.
 *
 * Fallback chain:
 *   1. Haversine with provided lat/lng
 *   2. Mock geocoding from address string
 *   3. Pincode-based coordinate lookup from addresses table
 *   4. Static default (2.0 km)
 *
 * @param {Object} warehouse - { lat, lng, addressString, pincode }
 * @param {Object} customer  - { lat, lng, addressString, pincode }
 * @returns {Promise<number>} Distance in km (2 decimal places)
 */
export async function calculateDeliveryDistance(warehouse, customer) {
  try {
    let wLat = parseFloat(warehouse.lat);
    let wLng = parseFloat(warehouse.lng);
    let cLat = parseFloat(customer.lat);
    let cLng = parseFloat(customer.lng);

    // Step 1: Attempt geocoding if warehouse coordinates are missing
    if (!isFinite(wLat) || !isFinite(wLng)) {
      const geo = await mockGeocode(warehouse.addressString || "");
      if (geo) {
        wLat = geo.lat;
        wLng = geo.lng;
      }
    }

    // Step 1: Attempt geocoding if customer coordinates are missing
    if (!isFinite(cLat) || !isFinite(cLng)) {
      const geo = await mockGeocode(customer.addressString || "");
      if (geo) {
        cLat = geo.lat;
        cLng = geo.lng;
      }
    }

    // Step 2: Pincode DB lookup for warehouse if still missing
    if (!isFinite(wLat) || !isFinite(wLng)) {
      const pincodeGeo = await lookupPincodeCoordinates(warehouse.pincode);
      if (pincodeGeo) {
        wLat = pincodeGeo.lat;
        wLng = pincodeGeo.lng;
        logger.info("Warehouse coordinates resolved via pincode DB lookup", { pincode: warehouse.pincode });
      }
    }

    // Step 2: Pincode DB lookup for customer if still missing
    if (!isFinite(cLat) || !isFinite(cLng)) {
      const pincodeGeo = await lookupPincodeCoordinates(customer.pincode);
      if (pincodeGeo) {
        cLat = pincodeGeo.lat;
        cLng = pincodeGeo.lng;
        logger.info("Customer coordinates resolved via pincode DB lookup", { pincode: customer.pincode });
      }
    }

    // If we now have all coordinates, use Haversine
    if (isFinite(wLat) && isFinite(wLng) && isFinite(cLat) && isFinite(cLng)) {
      return haversineDistance(wLat, wLng, cLat, cLng);
    }

    // Step 3: Pincode zone-based estimation (no DB needed)
    if (warehouse.pincode && customer.pincode) {
      const pincodeDistance = estimateDistanceFromPincodes(warehouse.pincode, customer.pincode);
      if (pincodeDistance !== null) {
        logger.info("Distance estimated from pincode zones", {
          warehousePincode: warehouse.pincode,
          customerPincode: customer.pincode,
          estimatedKm: pincodeDistance,
        });
        return pincodeDistance;
      }
    }

    // Step 4: Static fallback
    logger.warn("All distance methods exhausted — using static fallback", {
      fallback: DEFAULT_FALLBACK_DISTANCE_KM,
      warehousePincode: warehouse.pincode,
      customerPincode: customer.pincode,
    });
    return DEFAULT_FALLBACK_DISTANCE_KM;
  } catch (err) {
    logger.error("Distance calculation failed — using fallback", { error: err.message });
    return DEFAULT_FALLBACK_DISTANCE_KM;
  }
}

/**
 * Calculate delivery incentive from distance.
 * Flat rate ₹10/km with a minimum payout of ₹15.
 *
 * @param {number} distanceKm
 * @returns {number} Incentive amount in ₹ (2 decimal places)
 */
export function calculateIncentive(distanceKm) {
  return parseFloat(Math.max(15, distanceKm * 10).toFixed(2));
}
