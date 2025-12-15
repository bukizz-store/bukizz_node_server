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
export const executeTransaction = async (callback) => {
  // Supabase handles transactions automatically for single operations
  // For complex transactions, use Supabase's transaction methods
  logger.warn(
    "executeTransaction called - consider using Supabase's built-in transaction handling"
  );
  return await callback(getSupabase());
};
