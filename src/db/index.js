import { createClient } from "@supabase/supabase-js";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";

let supabaseClient = null;

/**
 * Initialize Supabase client
 * @returns {SupabaseClient} Supabase client instance
 */
function initSupabase() {
  try {
    supabaseClient = createClient(
      config.database.supabase.url,
      config.database.supabase.serviceKey || config.database.supabase.anonKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    logger.info("Supabase client initialized");
    return supabaseClient;
  } catch (error) {
    logger.error("Failed to initialize Supabase:", error);
    throw error;
  }
}

/**
 * Connect to Supabase database
 * @returns {Promise<void>}
 */
export async function connectDB() {
  initSupabase();

  // Test connection
  try {
    const { data, error } = await supabaseClient
      .from("users")
      .select("count")
      .limit(1);

    if (error && error.code !== "PGRST116") {
      // PGRST116 = relation does not exist (expected for new DB)
      throw error;
    }

    logger.info("Supabase connection established");
  } catch (error) {
    logger.warn(
      "Supabase connection test failed (this is normal for new databases):",
      error.message
    );
  }
}

/**
 * Get Supabase client
 * @returns {SupabaseClient} Supabase client instance
 */
export function getSupabase() {
  if (!supabaseClient) {
    // Auto-initialize if not already done
    logger.info("Auto-initializing Supabase client");
    initSupabase();
  }
  return supabaseClient;
}

// ═══════════════════════════════════════════════════════════════════════
// V12 FIX: Client caching to prevent connection exhaustion
// ═══════════════════════════════════════════════════════════════════════
const authenticatedClientCache = new Map();
const CLIENT_CACHE_MAX_SIZE = 100;
const CLIENT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Create an authenticated Supabase client for a specific user
 * Implements caching to prevent connection exhaustion under high load
 * @param {string} token - JWT access token
 * @returns {SupabaseClient} Authenticated Supabase client
 */
export function createAuthenticatedClient(token) {
  if (!token) {
    return getSupabase();
  }

  // Use token prefix as cache key (tokens are long, prefix is sufficient)
  const cacheKey = token.substring(0, 32);
  const cached = authenticatedClientCache.get(cacheKey);

  // Return cached client if still valid
  if (cached && Date.now() < cached.expiresAt) {
    return cached.client;
  }

  // Evict oldest entry if cache is full (simple LRU-like behavior)
  if (authenticatedClientCache.size >= CLIENT_CACHE_MAX_SIZE) {
    const oldestKey = authenticatedClientCache.keys().next().value;
    authenticatedClientCache.delete(oldestKey);
  }

  try {
    const client = createClient(
      config.database.supabase.url,
      config.database.supabase.serviceKey,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
        auth: {
          persistSession: false,
        },
      }
    );

    // Cache the client with TTL
    authenticatedClientCache.set(cacheKey, {
      client,
      expiresAt: Date.now() + CLIENT_CACHE_TTL_MS
    });

    return client;
  } catch (error) {
    logger.error("Failed to create authenticated client:", error);
    return getSupabase();
  }
}

// Clean up expired clients periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of authenticatedClientCache.entries()) {
    if (now >= value.expiresAt) {
      authenticatedClientCache.delete(key);
    }
  }
}, 60000); // Clean every minute

/**
 * Create a Service Role Supabase client (Bypasses RLS)
 * @returns {SupabaseClient} Service Role Supabase client
 */
export function createServiceClient() {
  const serviceKey = config.database.supabase.serviceKey;

  if (!serviceKey) {
    logger.warn("SUPABASE_SERVICE_ROLE_KEY missing - falling back to anon client (RLS applies)");
    return getSupabase();
  }

  try {
    return createClient(
      config.database.supabase.url,
      serviceKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
  } catch (error) {
    logger.error("Failed to create service client:", error);
    return getSupabase();
  }
}

/**
 * Execute Supabase query with proper error handling
 * @param {string} table - Table name
 * @param {string} operation - Operation type (select, insert, update, delete)
 * @param {Object} options - Query options
 * @returns {Promise<any>} Query results
 */
export async function executeSupabaseQuery(table, operation, options = {}) {
  try {
    const supabase = getSupabase();
    let query = supabase.from(table);

    switch (operation) {
      case "select":
        query = query.select(options.select || "*");
        if (options.eq) {
          Object.entries(options.eq).forEach(([key, value]) => {
            query = query.eq(key, value);
          });
        }
        if (options.in) {
          Object.entries(options.in).forEach(([key, values]) => {
            query = query.in(key, values);
          });
        }
        if (options.like) {
          Object.entries(options.like).forEach(([key, value]) => {
            query = query.ilike(key, value);
          });
        }
        if (options.order) {
          query = query.order(options.order.column, {
            ascending: options.order.ascending,
          });
        }
        if (options.range) {
          query = query.range(options.range.from, options.range.to);
        }
        break;

      case "insert":
        query = query.insert(options.data);
        if (options.select) {
          query = query.select(options.select);
        }
        break;

      case "update":
        query = query.update(options.data);
        if (options.eq) {
          Object.entries(options.eq).forEach(([key, value]) => {
            query = query.eq(key, value);
          });
        }
        if (options.select) {
          query = query.select(options.select);
        }
        break;

      case "delete":
        if (options.eq) {
          Object.entries(options.eq).forEach(([key, value]) => {
            query = query.eq(key, value);
          });
        }
        break;

      default:
        throw new Error(`Unsupported operation: ${operation}`);
    }

    const { data, error } = await query;

    if (error) {
      logger.error("Supabase query error:", {
        table,
        operation,
        options,
        error: error.message,
      });
      throw error;
    }

    return data;
  } catch (error) {
    logger.error("Supabase query execution error:", error);
    throw error;
  }
}

/**
 * Execute Supabase RPC (stored procedure/function)
 * @param {string} functionName - Function name
 * @param {Object} params - Function parameters
 * @returns {Promise<any>} Function result
 */
export async function executeSupabaseRPC(functionName, params = {}) {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc(functionName, params);

    if (error) {
      logger.error("Supabase RPC error:", {
        functionName,
        params,
        error: error.message,
      });
      throw error;
    }

    return data;
  } catch (error) {
    logger.error("Supabase RPC execution error:", error);
    throw error;
  }
}

/**
 * Close database connections gracefully
 * @returns {Promise<void>}
 */
export async function closeDB() {
  try {
    // Supabase connections are managed automatically
    logger.info("Supabase connections closed");
  } catch (error) {
    logger.error("Error closing database connections:", error);
  }
}

/**
 * Database object with common operations
 */
export const db = {
  supabase: getSupabase,
  query: executeSupabaseQuery,
  rpc: executeSupabaseRPC,
  connect: connectDB,
  close: closeDB,
};

/**
 * Get database instance - alias for backward compatibility
 * @returns {Object} Database object with operations
 */
export function getDB() {
  return db;
}

// Legacy compatibility aliases
export const executeQuery = executeSupabaseQuery;

/**
 * @deprecated This function does NOT provide ACID transaction guarantees.
 * Supabase JS client doesn't support multi-statement transactions.
 *
 * For operations requiring atomicity, use PostgreSQL RPC functions instead:
 * - atomic_batch_decrement_stock() - for stock operations
 * - atomic_claim_items() - for delivery partner claims
 * - atomic_wallet_payout() - for wallet operations
 * - check_and_mark_webhook_processed() - for idempotency
 *
 * See: server/src/db/migrations/atomic_functions.sql
 *
 * @param {Function} callback - Function receiving supabase client
 * @returns {Promise<any>} Result of callback
 */
export const executeTransaction = async (callback) => {
  logger.warn(
    "DEPRECATED: executeTransaction() does NOT provide ACID guarantees. " +
    "Use Supabase RPC functions for atomic operations. " +
    "See: server/src/db/migrations/atomic_functions.sql"
  );
  return await callback(getSupabase());
};
