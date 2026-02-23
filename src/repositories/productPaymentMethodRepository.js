import { getSupabase } from "../db/index.js";

class ProductPaymentMethodRepository {
    /**
     * Add a payment method to a product.
     */
    async addPaymentMethod(productId, paymentMethod) {
        const supabase = getSupabase();
        const { data, error } = await supabase
            .from("product_payment_methods")
            .upsert({ product_id: productId, payment_method: paymentMethod }, { onConflict: 'product_id, payment_method', ignoreDuplicates: true })
            .select()
            .single();

        return data || { product_id: productId, payment_method: paymentMethod };
    }

    /**
     * Set multiple payment methods for a product, removing unlisted ones.
     */
    async setPaymentMethods(productId, paymentMethods) {
        const supabase = getSupabase();

        // Remove existing methods
        const { error: deleteError } = await supabase
            .from("product_payment_methods")
            .delete()
            .eq("product_id", productId);

        if (deleteError) throw deleteError;

        if (paymentMethods && paymentMethods.length > 0) {
            // Insert new ones
            const inserts = paymentMethods.map((pm) => ({ product_id: productId, payment_method: pm }));
            const { error: insertError } = await supabase
                .from("product_payment_methods")
                .insert(inserts);

            if (insertError) throw insertError;
        }

        return await this.getPaymentMethods(productId);
    }

    /**
     * Get all active payment methods for a product.
     */
    async getPaymentMethods(productId) {
        const supabase = getSupabase();
        const { data, error } = await supabase
            .from("product_payment_methods")
            .select("payment_method")
            .eq("product_id", productId);

        if (error) throw error;
        return data.map((row) => row.payment_method);
    }

    /**
     * Remove a payment method from a product.
     */
    async removePaymentMethod(productId, paymentMethod) {
        const supabase = getSupabase();
        const { error } = await supabase
            .from("product_payment_methods")
            .delete()
            .eq("product_id", productId)
            .eq("payment_method", paymentMethod);

        if (error) throw error;
    }
}

export const productPaymentMethodRepository = new ProductPaymentMethodRepository();
