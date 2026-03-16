import { logger } from "../utils/logger.js";
import {
  calculateDeliveryDistance,
  calculateIncentive,
} from "../utils/distanceCalc.js";

/**
 * Delivery Incentive Service (Factory Function with DI)
 *
 * Business rules:
 *   - Flat rate: ₹10 per km
 *   - Minimum payout: ₹15
 *   - Estimation shown when DP browses warehouse orders
 *   - Finalized & credited to ledger when DP marks order as DELIVERED
 */
const deliveryIncentiveService = ({
  dpLedgerRepository,
  orderRepository,
}) => {
  /**
   * Build location object from a warehouse address record.
   * Addresses table stores lat/lng + line1, city, state, postal_code.
   */
  function _buildLocation(addressObj) {
    if (!addressObj) return { lat: null, lng: null, addressString: "", pincode: null };

    const parts = [
      addressObj.line1,
      addressObj.line2,
      addressObj.city,
      addressObj.state,
      addressObj.postal_code,
      addressObj.country,
    ].filter(Boolean);

    return {
      lat: addressObj.lat ?? null,
      lng: addressObj.lng ?? null,
      addressString: parts.join(", "),
      pincode: addressObj.postal_code || null,
    };
  }

  /**
   * Build location object from a shipping_address JSON stored on orders.
   */
  function _buildCustomerLocation(shippingAddress) {
    if (!shippingAddress) return { lat: null, lng: null, addressString: "", pincode: null };

    const parts = [
      shippingAddress.line1 || shippingAddress.addressLine1,
      shippingAddress.line2 || shippingAddress.addressLine2,
      shippingAddress.city,
      shippingAddress.state,
      shippingAddress.postalCode || shippingAddress.postal_code,
      shippingAddress.country,
    ].filter(Boolean);

    return {
      lat: shippingAddress.coordinates?.lat ?? shippingAddress.lat ?? null,
      lng: shippingAddress.coordinates?.lng ?? shippingAddress.lng ?? null,
      addressString: parts.join(", "),
      pincode: shippingAddress.postalCode || shippingAddress.postal_code || null,
    };
  }

  return {
    /**
     * Estimate incentive for a single item/order pair.
     * Used during the discovery phase (Explore Warehouse Screen).
     *
     * @param {Object} warehouseAddress - Address record from DB
     * @param {Object} shippingAddress  - JSON from orders.shipping_address
     * @returns {Promise<{ distanceKm: number, estimatedIncentive: number }>}
     */
    async estimateIncentive(warehouseAddress, shippingAddress) {
      const warehouseLoc = _buildLocation(warehouseAddress);
      const customerLoc = _buildCustomerLocation(shippingAddress);

      const distanceKm = await calculateDeliveryDistance(warehouseLoc, customerLoc);
      const estimatedIncentive = calculateIncentive(distanceKm);

      return { distanceKm, estimatedIncentive };
    },

    /**
     * Finalize incentive when order is marked as DELIVERED.
     *   1. Calculate exact distance & incentive
     *   2. Update orders table with delivery_distance_km & delivery_incentive_amount
     *   3. Insert an immutable ledger row in dp_ledgers
     *
     * @param {Object} params
     * @param {string} params.orderId
     * @param {string} params.dpUserId
     * @param {Object} params.warehouseAddress
     * @param {Object} params.shippingAddress
     * @param {Object} supabase - Supabase client (for transactional use)
     * @returns {Promise<{ distanceKm: number, incentiveAmount: number }>}
     */
    async finalizeIncentive({ orderId, dpUserId, warehouseAddress, shippingAddress }, supabase) {
      const warehouseLoc = _buildLocation(warehouseAddress);
      const customerLoc = _buildCustomerLocation(shippingAddress);

      const distanceKm = await calculateDeliveryDistance(warehouseLoc, customerLoc);
      const incentiveAmount = calculateIncentive(distanceKm);

      // Update order with distance & incentive
      const { error: updateError } = await supabase
        .from("orders")
        .update({
          delivery_distance_km: distanceKm,
          delivery_incentive_amount: incentiveAmount,
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId);

      if (updateError) {
        logger.error("Failed to update order with incentive data:", updateError);
        throw updateError;
      }

      // Insert immutable ledger entry
      await dpLedgerRepository.createEntry({
        dp_user_id: dpUserId,
        order_id: orderId,
        transaction_type: "delivery_earning",
        amount: incentiveAmount,
        description: `Delivery earning: ${distanceKm} km × ₹10 = ₹${incentiveAmount}`,
      });

      logger.info("Delivery incentive finalized", {
        orderId,
        dpUserId,
        distanceKm,
        incentiveAmount,
      });

      return { distanceKm, incentiveAmount };
    },

    /**
     * Get wallet balance + recent transactions for a delivery partner.
     * @param {string} dpUserId
     * @param {Object} options - { page, limit }
     * @returns {Promise<{ balance: number, transactions: Array, pagination: Object }>}
     */
    async getWallet(dpUserId, options = {}) {
      const [balance, { transactions, pagination }] = await Promise.all([
        dpLedgerRepository.getBalance(dpUserId),
        dpLedgerRepository.getTransactions(dpUserId, options),
      ]);

      return { balance, transactions, pagination };
    },
  };
};

export default deliveryIncentiveService;
