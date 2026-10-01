import { executeSupabaseQuery } from "../db/index.js";

export const invoiceRepository = {
  async createInvoice(payload) {
    return executeSupabaseQuery((supabase) =>
      supabase
        .from("invoices")
        .insert(payload)
        .select()
        .single()
    );
  },

  /**
   * Retrieves the next consecutive sequence integer for a given series and financial year.
   * Utilizes PostgreSQL atomic procedure `get_next_invoice_number` with resilient fallback.
   *
   * @param {string} seriesCode - Series identifier (e.g., 'FAI', 'CNB_DF', 'CNB_PF')
   * @param {string} financialYear - Fiscal year suffix (e.g., '27')
   * @returns {Promise<number>} Next sequential integer
   */
  async getNextSequence(seriesCode, financialYear) {
    try {
      const res = await executeSupabaseQuery((supabase) =>
        supabase.rpc("get_next_invoice_number", {
          p_series_code: seriesCode,
          p_financial_year: financialYear,
        })
      );
      if (res !== null && res !== undefined && !isNaN(Number(res)) && Number(res) > 0) {
        return Number(res);
      }
    } catch (err) {
      // Fallback if RPC is not installed in database yet
    }

    try {
      const prefix = seriesCode.includes("_")
        ? `${seriesCode.split("_")[0]}-${financialYear}/${seriesCode.split("_")[1]}-`
        : `${seriesCode}-${financialYear}/`;

      const invoices = await executeSupabaseQuery((supabase) =>
        supabase
          .from("invoices")
          .select("invoice_number")
          .ilike("invoice_number", `${prefix}%`)
      );

      let maxSeq = 0;
      if (Array.isArray(invoices)) {
        for (const inv of invoices) {
          const numStr = inv.invoice_number || "";
          const match = numStr.match(/(\d+)$/);
          if (match) {
            const val = parseInt(match[1], 10);
            if (!isNaN(val) && val > maxSeq) {
              maxSeq = val;
            }
          }
        }
        if (maxSeq === 0) {
          maxSeq = invoices.length;
        }
      }
      return maxSeq + 1;
    } catch (err2) {
      return 1;
    }
  },

  async findByOrderId(orderId) {
    return executeSupabaseQuery((supabase) =>
      supabase
        .from("invoices")
        .select("*")
        .eq("order_id", orderId)
        .order("issued_at", { ascending: true })
    );
  },

  async findById(invoiceId) {
    return executeSupabaseQuery((supabase) =>
      supabase
        .from("invoices")
        .select(`
          *,
          order:orders (
            id,
            order_number,
            user_id,
            shipping_address,
            payment_method,
            payment_status,
            created_at
          ),
          retailer:users!retailer_id (
            id,
            full_name,
            retailer_code,
            metadata
          )
        `)
        .eq("id", invoiceId)
        .maybeSingle()
    );
  },

  async existsForOrderItemAndType(orderItemId, invoiceType) {
    const records = await executeSupabaseQuery((supabase) =>
      supabase
        .from("invoices")
        .select("id, invoice_number")
        .eq("order_item_id", orderItemId)
        .eq("invoice_type", invoiceType)
    );
    return records && records.length > 0 ? records[0] : null;
  },

  async existsForOrderAndType(orderId, invoiceType) {
    const records = await executeSupabaseQuery((supabase) =>
      supabase
        .from("invoices")
        .select("id, invoice_number")
        .eq("order_id", orderId)
        .eq("invoice_type", invoiceType)
    );
    return records && records.length > 0 ? records[0] : null;
  },
};
