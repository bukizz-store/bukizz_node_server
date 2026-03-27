import { AppError } from "../middleware/errorHandler.js";
import { logger } from "../utils/logger.js";
import { getSupabase } from "../db/index.js";

/**
 * DP Admin Service Factory
 * Business logic layer for admin delivery partner management.
 *
 * @param {Object} deps
 * @param {Object} deps.dpAdminRepository
 * @returns {Object} Service methods
 */
export function dpAdminService({ dpAdminRepository }) {
  return {
    /**
     * Get the list of delivery partners (Hub List).
     * Flags DPs whose wallet balance exceeds their cash_in_hand_limit.
     * Optionally filters by Idle/In-Transit status based on active order count.
     */
    async getHubList(query) {
      const result = await dpAdminRepository.getDeliveryPartnersList(query);

      // Enrich with flags
      const partners = result.partners.map((dp) => {
        const dpData = dp.delivery_partner_data?.[0] || dp.delivery_partner_data || {};
        const cashLimit = parseFloat(dpData.cash_in_hand_limit) || 0;
        const walletBalance = dp.walletBalance || 0;

        // Determine computed status
        let computedStatus = "Idle";
        if (!dp.is_active) {
          computedStatus = "Inactive";
        } else if (dp.activeOrderCount > 0) {
          computedStatus = "In-Transit";
        }

        return {
          ...dp,
          delivery_partner_data: {
            ...dpData,
            city: dp.city,
            cash_in_hand_limit: cashLimit,
          },
          computedStatus,
          cashLimitExceeded: cashLimit > 0 && walletBalance > cashLimit,
          cashInHandLimit: cashLimit,
        };
      });

      // Apply status filter at service level (Idle vs In-Transit requires computed data)
      let filtered = partners;
      if (query.status === "Idle") {
        filtered = partners.filter((dp) => dp.computedStatus === "Idle");
      } else if (query.status === "In-Transit") {
        filtered = partners.filter((dp) => dp.computedStatus === "In-Transit");
      } else if (query.status === "Inactive") {
        filtered = partners.filter((dp) => dp.computedStatus === "Inactive");
      }

      return {
        partners: filtered,
        pagination: result.pagination,
      };
    },

    /**
     * Get comprehensive DP details: profile + vehicle + wallet summary.
     */
    async getDpDetails(dpId) {
      const profile = await dpAdminRepository.getDpProfile(dpId);

      if (!profile) {
        throw new AppError("Delivery partner not found", 404);
      }

      // Get wallet balance
      const walletBalance = await dpAdminRepository._getWalletBalance(dpId);
      const activeOrderCount =
        await dpAdminRepository._getActiveOrderCount(dpId);

      const dpData = profile.delivery_partner_data?.[0] || profile.delivery_partner_data || {};

      return {
        profile: {
          id: profile.id,
          fullName: profile.full_name,
          email: profile.email,
          phone: profile.phone,
          isActive: profile.is_active,
          createdAt: profile.created_at,
          updatedAt: profile.updated_at,
        },
        vehicle: dpData.vehicle_details || null,
        kyc: {
          status: dpData.kyc_status || "pending",
          data: dpData.documents || null,
        },
        bank: {
          accountName: dpData.bank_account_name || null,
          accountNumberMasked: dpData.bank_account_number_masked || null,
          ifsc: dpData.bank_ifsc || null,
          verificationStatus: dpData.bank_verification_status || null,
        },
        financials: {
          walletBalance,
          cashInHandLimit: 0,
          isCodEligible: dpData.is_cod_eligible || false,
          cashLimitExceeded: false,
        },
        activeOrderCount,
      };
    },

    /**
     * Get active loadout with SLA timer.
     * Calculates time-to-deliver from oldest locked order.
     * Returns warning flag if > 4 hours.
     */
    async getActiveLoadoutWithSLA(dpId) {
      const orders = await dpAdminRepository.getActiveLoadout(dpId);

      if (orders.length === 0) {
        return {
          orders: [],
          sla: {
            oldestOrderTime: null,
            elapsedMs: 0,
            elapsedFormatted: "0h 0m",
            warning: false,
          },
        };
      }

      // Find the oldest updated_at timestamp (orders are sorted asc by updated_at)
      const oldestTimestamp = new Date(orders[0].updated_at).getTime();
      const now = Date.now();
      const elapsedMs = now - oldestTimestamp;

      const hours = Math.floor(elapsedMs / (1000 * 60 * 60));
      const minutes = Math.floor((elapsedMs % (1000 * 60 * 60)) / (1000 * 60));
      const SLA_THRESHOLD_MS = 4 * 60 * 60 * 1000; // 4 hours

      return {
        orders,
        sla: {
          oldestOrderTime: orders[0].updated_at,
          elapsedMs,
          elapsedFormatted: `${hours}h ${minutes}m`,
          warning: elapsedMs > SLA_THRESHOLD_MS,
        },
      };
    },

    /**
     * Force unassign an order from a DP.
     * Validates ownership and creates audit log.
     */
    async forceUnassignOrder(dpId, payload, adminId) {
      const { orderId, reason } = payload;

      logger.info("Admin force-unassigning order", {
        adminId,
        dpId,
        orderId,
        reason,
      });

      const updatedOrder = await dpAdminRepository.unassignOrder(
        orderId,
        dpId,
        reason,
        adminId,
      );

      return {
        order: updatedOrder,
        message: "Order unassigned successfully",
      };
    },

    /**
     * Get ledger and settlements for a DP.
     * Fetches ledger data and calculates running balance.
     */
    async getLedgerAndSettlements(dpId, query) {
      const ledgerResult = await dpAdminRepository.getDpLedger(dpId, query);
      const walletBalance = await dpAdminRepository._getWalletBalance(dpId);

      // Calculate running balance for each transaction
      let runningBalance = walletBalance;
      const transactionsWithBalance = ledgerResult.transactions.map((tx) => {
        const entry = {
          ...tx,
          runningBalance: parseFloat(runningBalance.toFixed(2)),
        };
        // Since transactions are newest-first, subtract to go backwards
        runningBalance -= parseFloat(tx.amount || 0);
        return entry;
      });

      return {
        transactions: transactionsWithBalance,
        currentBalance: walletBalance,
        pagination: ledgerResult.pagination,
      };
    },

    /**
     * Get delivery history for a DP (paginated).
     */
    async getDeliveryHistory(dpId, query) {
      return await dpAdminRepository.getDeliveryHistory(dpId, query);
    },

    /**
     * Initiate a payout to a Delivery Partner.
     * Uses atomic RPC to prevent race conditions and overdraw.
     */
    async initiatePayout(dpId, payoutData, adminId) {
      const profile = await dpAdminRepository.getDpProfile(dpId);
      if (!profile) {
        throw new AppError("Delivery partner not found", 404);
      }

      const { amount, paymentMode, referenceNumber, notes, receiptUrl } = payoutData;

      // Build description
      const description = `Admin Payout (${paymentMode})${referenceNumber ? ` Ref: ${referenceNumber}` : ""}${notes ? ` - ${notes}` : ""}`;

      // Use atomic RPC for balance check + debit in single transaction
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc('atomic_wallet_payout', {
        p_dp_id: dpId,
        p_amount: amount,
        p_description: description,
        p_type: 'payout'
      });

      if (error) {
        logger.error("Atomic wallet payout RPC failed", { dpId, amount, error: error.message });
        throw new AppError(`Payout failed: ${error.message}`, 500);
      }

      const result = data?.[0];
      if (!result?.success) {
        const errorMsg = result?.error_message || `Insufficient balance. Current: ₹${result?.new_balance || 0}`;
        throw new AppError(errorMsg, 400);
      }

      logger.info("Admin initiated DP payout (atomic)", {
        adminId,
        dpId,
        amount,
        paymentMode,
        receiptUrl,
        newBalance: result.new_balance,
        transactionId: result.transaction_id
      });

      return {
        transaction: { id: result.transaction_id },
        newBalance: result.new_balance,
        message: "Payout executed successfully",
      };
    },

    /**
     * Update COD Eligibility
     */
    async updateCodEligibility(dpId, isCodEligible) {
      if (typeof isCodEligible !== "boolean") {
        throw new AppError("Invalid eligibility value", 400);
      }
      return await dpAdminRepository.updateCodEligibility(dpId, isCodEligible);
    },
  };
}
