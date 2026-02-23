import { getSupabase } from "../db/index.js";

class VariantCommissionRepository {
    /**
     * Set a new active commission for a variant.
     * This expires any currently active commission and creates a new one.
     */
    async setCommission(variantId, commissionType, commissionValue) {
        const supabase = getSupabase();

        // 1. Expire current active commission
        const { error: updateError } = await supabase
            .from("variant_commissions")
            .update({ effective_to: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq("variant_id", variantId)
            .is("effective_to", null);

        if (updateError) throw updateError;

        // 2. Insert new commission
        const { data, error: insertError } = await supabase
            .from("variant_commissions")
            .insert([{
                variant_id: variantId,
                commission_type: commissionType,
                commission_value: commissionValue
            }])
            .select()
            .single();

        if (insertError) throw insertError;
        return data;
    }

    /**
     * Get the currently active commission for a variant.
     */
    async getActiveCommission(variantId) {
        const supabase = getSupabase();
        const { data, error } = await supabase
            .from("variant_commissions")
            .select("*")
            .eq("variant_id", variantId)
            .is("effective_to", null)
            .single();

        if (error && error.code !== "PGRST116") throw error; // PGRST116 corresponds to 0 rows
        return data || null;
    }

    /**
     * Get historical commissions for a variant.
     */
    async getCommissionHistory(variantId) {
        const supabase = getSupabase();
        const { data, error } = await supabase
            .from("variant_commissions")
            .select("*")
            .eq("variant_id", variantId)
            .order("effective_from", { ascending: false });

        if (error) throw error;
        return data || [];
    }

    /**
     * Get active commissions for all variants of a product.
     */
    async getCommissionsByProduct(productId) {
        const supabase = getSupabase();
        const { data, error } = await supabase
            .from("variant_commissions")
            .select("*, product_variants!inner(product_id)")
            .eq("product_variants.product_id", productId)
            .is("effective_to", null);

        if (error) throw error;

        return data ? data.map(item => {
            const { product_variants, ...rest } = item;
            return rest;
        }) : [];
    }

    /**
     * Bulk update variant commissions
     * @param {Array<{variantId, commissionType, commissionValue}>} commissions
     */
    async bulkSetCommissions(commissions) {
        if (!commissions || commissions.length === 0) return [];

        const results = [];
        for (const item of commissions) {
            const res = await this.setCommission(item.variantId, item.commissionType, item.commissionValue);
            results.push(res);
        }

        return results;
    }
}

export const variantCommissionRepository = new VariantCommissionRepository();
