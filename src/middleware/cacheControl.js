/**
 * Cache Control Middleware
 * Sets appropriate Cache-Control headers based on route type to reduce egress costs.
 */

/**
 * Cache durations (in seconds)
 */
export const CACHE_DURATIONS = {
  NONE: 0,
  SHORT: 60,        // 1 minute - for semi-dynamic data
  MEDIUM: 120,      // 2 minutes - for catalog/listing data
  LONG: 300,        // 5 minutes - for rarely changing data
  STATIC: 3600,     // 1 hour - for static content
};

/**
 * Creates a middleware that sets Cache-Control headers
 * @param {number} maxAge - Cache duration in seconds
 * @param {Object} options - Additional options
 * @param {boolean} options.isPublic - Whether the response can be cached publicly (default: true)
 * @param {boolean} options.mustRevalidate - Whether to require revalidation after expiry (default: false)
 * @returns {Function} Express middleware
 */
export function cacheControl(maxAge, options = {}) {
  const { isPublic = true, mustRevalidate = false } = options;

  return (req, res, next) => {
    // Skip caching for non-GET requests
    if (req.method !== 'GET') {
      return next();
    }

    const directives = [];

    if (isPublic) {
      directives.push('public');
    } else {
      directives.push('private');
    }

    directives.push(`max-age=${maxAge}`);

    if (mustRevalidate) {
      directives.push('must-revalidate');
    }

    // Set s-maxage for CDN caching (same as max-age by default)
    if (isPublic && maxAge > 0) {
      directives.push(`s-maxage=${maxAge}`);
    }

    res.set('Cache-Control', directives.join(', '));

    // Add Vary header to ensure proper caching with different Accept-Encoding
    res.set('Vary', 'Accept-Encoding');

    next();
  };
}

/**
 * Middleware to disable caching for sensitive/dynamic data
 */
export function noCache() {
  return (req, res, next) => {
    res.set('Cache-Control', 'private, no-store, no-cache, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
  };
}

/**
 * Pre-configured cache middleware for common use cases
 */
export const cacheMiddleware = {
  // For public catalog data (schools, products listing)
  catalog: cacheControl(CACHE_DURATIONS.MEDIUM, { isPublic: true }),
  
  // For school/product details
  details: cacheControl(CACHE_DURATIONS.SHORT, { isPublic: true }),
  
  // For static data (cities, categories, brands)
  static: cacheControl(CACHE_DURATIONS.LONG, { isPublic: true }),
  
  // For user-specific data (cart, orders, wallet)
  private: noCache(),
};

export default cacheMiddleware;
