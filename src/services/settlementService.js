import { AppError } from "../middleware/errorHandler.js";
import { logger } from "../utils/logger.js";
import { v4 as uuidv4 } from "uuid";

/**
 * Settlement Service
 * Orchestrates the Immutable Multi-line Ledger and FIFO Partial Settlement algorithm.
 *
 * Responsibilities:
 *  - Creating multi-line ledger entries for each order (ORDER_REVENUE + PLATFORM_FEE).
 *  - Recording manual adjustments (bonuses / penalties).
 *  - Calculating the FIFO payout distribution across AVAILABLE & PARTIALLY_SETTLED entries.
 *  - Delegating the atomic DB transaction to the repository layer.
 *  - Querying ledger history & settlement history.
 */
export class SettlementService {
  /**
   * @param {Object} ledgerRepository      - Data access for seller_ledgers.
   * @param {Object} settlementRepository  - Data access for settlements & mappings.
   */
  constructor(ledgerRepository, settlementRepository) {
    this.ledgerRepository = ledgerRepository;
    this.settlementRepository = settlementRepository;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  MANUAL ADJUSTMENTS
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Record a manual ledger adjustment (penalty, bonus, correction, etc.).
   * The entry starts as AVAILABLE immediately (no hold period).
   *
   * @param {Object}  params
   * @param {string}  params.retailerId
   * @param {string}  [params.warehouseId]
   * @param {number}  params.amount      - Always positive; entryType dictates direction.
   * @param {string}  params.entryType   - 'CREDIT' | 'DEBIT'
   * @param {string}  [params.notes]
   * @param {string}  params.adminId     - UUID of the admin performing the action.
   * @returns {Promise<Object>} The inserted ledger row.
   */
  async createManualAdjustment({
    retailerId,
    warehouseId,
    amount,
    entryType,
    notes,
    adminId,
  }) {
    try {
      if (!retailerId || !amount || !entryType) {
        throw new AppError(
          "retailerId, amount, and entryType are required",
          400,
        );
      }

      if (amount <= 0) {
        throw new AppError("Adjustment amount must be positive", 400);
      }

      if (!["CREDIT", "DEBIT"].includes(entryType)) {
        throw new AppError("entryType must be CREDIT or DEBIT", 400);
      }

      const now = new Date().toISOString();

      const entry = {
        id: uuidv4(),
        retailer_id: retailerId,
        warehouse_id: warehouseId || null,
        order_id: null,
        transaction_type: "MANUAL_ADJUSTMENT",
        entry_type: entryType,
        amount,
        settled_amount: 0,
        status: "AVAILABLE",
        trigger_date: now,
        notes: notes || `Manual ${entryType.toLowerCase()} by admin ${adminId}`,
        created_at: now,
      };

      const [result] = await this.ledgerRepository.createEntries([entry]);

      logger.info("Manual adjustment created", {
        retailerId,
        entryType,
        amount,
        adminId,
        ledgerId: result.id,
      });

      return result;
    } catch (error) {
      logger.error("Error creating manual adjustment:", error);
      throw error;
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //  REFUND CLAWBACK
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Create a REFUND_CLAWBACK ledger entry when a customer refund is processed.
   * This debits the retailer's available balance.
   *
   * @param {Object}  params
   * @param {string}  params.orderId
   * @param {string}  params.retailerId
   * @param {string}  [params.warehouseId]
   * @param {number}  params.refundAmount
   * @param {string}  [params.notes]
   * @returns {Promise<Object>} The inserted ledger row.
   */
  async createRefundClawback({
    orderId,
    retailerId,
    warehouseId,
    refundAmount,
    notes,
  }) {
    try {
      if (!orderId || !retailerId || !refundAmount) {
        throw new AppError(
          "orderId, retailerId, and refundAmount are required",
          400,
        );
      }

      const now = new Date().toISOString();

      const entry = {
        id: uuidv4(),
        retailer_id: retailerId,
        warehouse_id: warehouseId || null,
        order_id: orderId,
        transaction_type: "REFUND_CLAWBACK",
        entry_type: "DEBIT",
        amount: refundAmount,
        settled_amount: 0,
        status: "AVAILABLE",
        trigger_date: now,
        notes: notes || `Refund clawback for order ${orderId}`,
        created_at: now,
      };

      const [result] = await this.ledgerRepository.createEntries([entry]);

      logger.info("Refund clawback created", {
        orderId,
        retailerId,
        refundAmount,
        ledgerId: result.id,
      });

      return result;
    } catch (error) {
      logger.error("Error creating refund clawback:", error);
      throw error;
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //  FIFO SETTLEMENT EXECUTION
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Execute a FIFO partial settlement for a retailer.
   *
   * Algorithm:
   *   1. Retrieve all AVAILABLE + PARTIALLY_SETTLED CREDIT entries (FIFO order).
   *   2. Walk through entries oldest → newest, consuming amount until payout is fulfilled.
   *   3. Each entry is either fully consumed (→ SETTLED) or partially (→ PARTIALLY_SETTLED).
   *   4. Build the settlement record, ledger update patches, and mapping rows.
   *   5. Delegate the atomic write to the repository via RPC.
   *
   * @param {Object}  params
   * @param {string}  params.retailerId
   * @param {number}  params.amount        - Total payout amount.
   * @param {string}  params.paymentMode   - e.g. 'MANUAL_BANK_TRANSFER', 'CASH'
   * @param {string}  [params.referenceNumber] - UTR / transaction reference.
   * @param {string}  [params.notes]
   * @param {string}  [params.receiptUrl]
   * @param {string}  params.adminId       - UUID of the admin executing the settlement.
   * @returns {Promise<Object>} Settlement result.
   */
  async executeSettlement({
    retailerId,
    amount,
    paymentMode,
    referenceNumber,
    notes,
    receiptUrl,
    adminId,
  }) {
    try {
      // ── 1. Validation ──────────────────────────────────────────────────
      if (!retailerId || !amount || !paymentMode) {
        throw new AppError(
          "retailerId, amount, and paymentMode are required",
          400,
        );
      }

      if (amount <= 0) {
        throw new AppError("Settlement amount must be positive", 400);
      }

      // ── 2. Get eligible ledger entries (FIFO ordered) ──────────────────
      const availableEntries =
        await this.ledgerRepository.getAvailableForSettlement(retailerId);

      if (!availableEntries || availableEntries.length === 0) {
        throw new AppError(
          "No available ledger entries found for this retailer",
          400,
        );
      }

      // Calculate total available (only CREDIT entries contribute positively,
      // DEBIT entries reduce the available balance).
      const totalAvailable = this._calculateAvailableBalance(availableEntries);

      if (amount > totalAvailable) {
        throw new AppError(
          `Insufficient balance. Available: ₹${totalAvailable.toFixed(2)}, Requested: ₹${amount.toFixed(2)}`,
          400,
        );
      }

      // ── 3. FIFO distribution (pure business logic, no DB calls) ────────
      const { ledgerUpdates, mappingRecords } = this._calculateFifoDistribution(
        availableEntries,
        amount,
      );

      // ── 4. Build the settlement record ─────────────────────────────────
      const settlementId = uuidv4();
      const now = new Date().toISOString();

      const settlementRecord = {
        id: settlementId,
        retailer_id: retailerId,
        total_amount: amount,
        payment_mode: paymentMode,
        reference_number: referenceNumber || null,
        receipt_url: receiptUrl || null,
        notes: notes || null,
        status: "COMPLETED",
        settled_by: adminId,
        created_at: now,
      };

      // Stamp settlement_id onto each mapping record
      const stampedMappings = mappingRecords.map((m) => ({
        ...m,
        settlement_id: settlementId,
      }));

      // ── 5. Atomic write via repository ─────────────────────────────────
      const result = await this.settlementRepository.executeFifoSettlement(
        settlementRecord,
        ledgerUpdates,
        stampedMappings,
      );

      logger.info("FIFO settlement executed", {
        settlementId,
        retailerId,
        amount,
        paymentMode,
        entriesAffected: ledgerUpdates.length,
        adminId,
      });

      return {
        settlementId,
        amount,
        paymentMode,
        referenceNumber,
        status: "COMPLETED",
        entriesSettled: ledgerUpdates.length,
        result,
      };
    } catch (error) {
      logger.error("Error executing FIFO settlement:", error);
      throw error;
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //  QUERY METHODS
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Get the dashboard summary (total orders, total sales, etc.) for a specific warehouse.
   */
  async getDashboardSummary(retailerId, warehouseId) {
    try {
      if (!retailerId || !warehouseId) {
        throw new AppError("Retailer ID and Warehouse ID are required", 400);
      }
      return await this.ledgerRepository.getDashboardSummary(
        retailerId,
        warehouseId,
      );
    } catch (error) {
      logger.error("Error fetching dashboard summary:", error);
      throw error;
    }
  }

  /**
   * Get paginated ledger history with optional filters.
   */
  async getLedgerHistory(filters = {}) {
    try {
      return await this.ledgerRepository.getHistory(filters);
    } catch (error) {
      logger.error("Error fetching ledger history:", error);
      throw error;
    }
  }

  /**
   * Get paginated settlement (payout) history.
   */
  async getSettlements(filters = {}) {
    try {
      return await this.settlementRepository.getSettlements(filters);
    } catch (error) {
      logger.error("Error fetching settlements:", error);
      throw error;
    }
  }

  /**
   * Get a single settlement with its associated ledger entries.
   */
  async getSettlementDetails(settlementId) {
    try {
      if (!settlementId) {
        throw new AppError("Settlement ID is required", 400);
      }

      const details =
        await this.settlementRepository.getSettlementDetails(settlementId);

      if (!details) {
        throw new AppError("Settlement not found", 404);
      }

      return details;
    } catch (error) {
      logger.error("Error fetching settlement details:", error);
      throw error;
    }
  }

  /**
   * Get a retailer's current available balance (sum of CREDIT − DEBIT
   * among AVAILABLE and PARTIALLY_SETTLED entries).
   *
   * @param {string} retailerId
   * @returns {Promise<{ availableBalance: number, entryCount: number }>}
   */
  async getAvailableBalance(retailerId) {
    try {
      if (!retailerId) {
        throw new AppError("Retailer ID is required", 400);
      }

      const entries =
        await this.ledgerRepository.getAvailableForSettlement(retailerId);

      const availableBalance = this._calculateAvailableBalance(entries);

      return {
        availableBalance,
        entryCount: entries.length,
      };
    } catch (error) {
      logger.error("Error calculating available balance:", error);
      throw error;
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //  ADMIN METHODS
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Admin: Get the full financial summary for a retailer.
   *
   * Returns:
   *   totalOwed     — net CREDIT-DEBIT balance across AVAILABLE + PARTIALLY_SETTLED rows.
   *   pendingEscrow — same calculation for PENDING rows (not yet released).
   *   lifetimePaid  — total_amount sum across all COMPLETED settlements.
   *
   * @param {string} retailerId
   * @returns {Promise<{ totalOwed: number, pendingEscrow: number, lifetimePaid: number }>}
   */
  async getAdminRetailerSummary(retailerId) {
    try {
      if (!retailerId) {
        throw new AppError("Retailer ID is required", 400);
      }

      const [ledgerSummary, settlementHistory] = await Promise.all([
        this.ledgerRepository.getAdminRetailerSummary(retailerId),
        this.settlementRepository.getSettlementHistoryForRetailer(retailerId),
      ]);

      const lifetimePaid = settlementHistory
        .filter((s) => s.status === "COMPLETED")
        .reduce(
          (acc, s) => acc + parseFloat(s.total_amount || s.amount || 0),
          0,
        );

      return {
        totalOwed: ledgerSummary.totalOwed,
        pendingEscrow: ledgerSummary.pendingEscrow,
        lifetimePaid: parseFloat(lifetimePaid.toFixed(2)),
      };
    } catch (error) {
      logger.error("Error fetching admin retailer summary:", error);
      throw error;
    }
  }

  /**
   * Admin: Get all unsettled ledger entries for a retailer (AVAILABLE,
   * PARTIALLY_SETTLED, PENDING), ordered oldest-first so the UI
   * mirrors the FIFO settlement queue.
   *
   * @param {string} retailerId
   * @returns {Promise<Array<Object>>}
   */
  async getAdminUnsettledLedgers(retailerId) {
    try {
      if (!retailerId) {
        throw new AppError("Retailer ID is required", 400);
      }
      return await this.ledgerRepository.getUnsettledLedgers(retailerId);
    } catch (error) {
      logger.error("Error fetching admin unsettled ledgers:", error);
      throw error;
    }
  }

  /**
   * Admin: Get full payout history for a retailer (newest first).
   *
   * @param {string} retailerId
   * @returns {Promise<Array<Object>>}
   */
  async getAdminSettlementHistory(retailerId) {
    try {
      if (!retailerId) {
        throw new AppError("Retailer ID is required", 400);
      }
      return await this.settlementRepository.getSettlementHistoryForRetailer(
        retailerId,
      );
    } catch (error) {
      logger.error("Error fetching admin settlement history:", error);
      throw error;
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //  RETAILER METHODS
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Retailer: Get ledger history for the dashboard (Tabs 1 & 2).
   */
  async getRetailerLedgers(retailerId, warehouseId, queryParams = {}) {
    try {
      if (!retailerId || !warehouseId) {
        throw new AppError("Retailer ID and Warehouse ID are required", 400);
      }
      return await this.ledgerRepository.getHistory({
        ...queryParams,
        retailerId,
        warehouseId,
      });
    } catch (error) {
      logger.error("Error fetching retailer ledgers:", error);
      throw error;
    }
  }

  /**
   * Retailer: Get settlement payout history (Tab 3).
   */
  async getRetailerSettlementHistory(retailerId) {
    try {
      if (!retailerId) {
        throw new AppError("Retailer ID is required", 400);
      }
      // Reusing the same repo method used by Admin
      return await this.settlementRepository.getSettlementHistoryForRetailer(
        retailerId,
      );
    } catch (error) {
      logger.error("Error fetching retailer settlement history:", error);
      throw error;
    }
  }

  /**
   * Retailer: Get single settlement details with Razorpay-style breakdown.
   */
  async getRetailerSettlementDetails(settlementId, retailerId) {
    try {
      if (!settlementId || !retailerId) {
        throw new AppError("Settlement ID and Retailer ID are required", 400);
      }

      const details =
        await this.settlementRepository.getRetailerSettlementDetails(
          settlementId,
          retailerId,
        );

      if (!details) {
        throw new AppError("Settlement not found", 404);
      }

      // Calculate the Razorpay-style breakdown
      let grossSales = 0;
      let platformFees = 0;
      let returns = 0;
      let adjustments = 0;

      const ledgers = (details.settlement_ledger_items || []).map((item) => {
        const ledger = item.seller_ledgers;
        // Depending on the transaction_type, bucket the applied amount
        const amount = parseFloat(item.allocated_amount || 0);

        if (ledger.transaction_type === "ORDER_REVENUE") {
          grossSales += amount;
        } else if (ledger.transaction_type === "PLATFORM_FEE") {
          platformFees += amount;
        } else if (
          ledger.transaction_type === "REFUND_CLAWBACK" ||
          ledger.transaction_type === "RETURN_DEDUCTION" ||
          ledger.transaction_type === "REFUND"
        ) {
          returns += amount;
        } else if (ledger.transaction_type === "MANUAL_ADJUSTMENT") {
          adjustments += amount;
        }

        return {
          ...ledger,
          amount_applied_in_this_settlement: item.allocated_amount,
        };
      });

      // Format the response to match UI expectations
      return {
        settlement: {
          id: details.id,
          total_amount: parseFloat(details.amount || details.total_amount || 0),
          payment_mode: details.payment_mode,
          reference_number: details.reference_number,
          receipt_url: details.receipt_url,
          created_at: details.created_at,
          status: details.status,
          notes: details.notes,
        },
        breakup: {
          grossSales: parseFloat(grossSales.toFixed(2)),
          deductions: {
            platformFees: Math.abs(parseFloat(platformFees.toFixed(2))),
            returns: Math.abs(parseFloat(returns.toFixed(2))),
            adjustments: Math.abs(parseFloat(adjustments.toFixed(2))),
            totalDeductions: Math.abs(
              parseFloat((platformFees + returns + adjustments).toFixed(2)),
            ),
          },
        },
        ledgers,
      };
    } catch (error) {
      logger.error("Error fetching retailer settlement details:", error);
      throw error;
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //  PRIVATE HELPERS
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Calculate the net available balance from a list of ledger entries.
   * CREDIT entries add to the balance, DEBIT entries reduce it.
   * Partially settled entries contribute only their remaining amount.
   *
   * @param {Array<Object>} entries - Ledger rows (must have entry_type, amount, settled_amount).
   * @returns {number} Net available balance.
   */
  _calculateAvailableBalance(entries) {
    let balance = 0;

    for (const entry of entries) {
      const remaining =
        parseFloat(entry.amount) - parseFloat(entry.settled_amount || 0);

      if (entry.entry_type === "CREDIT") {
        balance += remaining;
      } else if (entry.entry_type === "DEBIT") {
        balance -= remaining;
      }
    }

    return parseFloat(balance.toFixed(2));
  }

  /**
   * Pure FIFO distribution algorithm.
   *
   * Walks through CREDIT entries oldest → newest and consumes the requested
   * payout amount. Each entry is either fully settled or partially settled.
   * DEBIT entries are skipped in the settlement walk (they were already
   * accounted for in the balance check).
   *
   * @param {Array<Object>} entries       - FIFO-ordered available entries.
   * @param {number}        payoutAmount  - Total amount to settle.
   * @returns {{ ledgerUpdates: Array, mappingRecords: Array }}
   */
  _calculateFifoDistribution(entries, payoutAmount) {
    const ledgerUpdates = [];
    const mappingRecords = [];
    let remaining = payoutAmount;

    for (const entry of entries) {
      if (remaining <= 0) break;

      // Only consume from CREDIT entries in a settlement walk
      if (entry.entry_type !== "CREDIT") continue;

      const entryRemaining =
        parseFloat(entry.amount) - parseFloat(entry.settled_amount || 0);

      if (entryRemaining <= 0) continue;

      // How much we take from this entry
      const applied = Math.min(remaining, entryRemaining);
      const newSettledAmount = parseFloat(entry.settled_amount || 0) + applied;

      // Determine new status
      const isFullySettled =
        Math.abs(newSettledAmount - parseFloat(entry.amount)) < 0.01;

      ledgerUpdates.push({
        id: entry.id,
        settled_amount: parseFloat(newSettledAmount.toFixed(2)),
        status: isFullySettled ? "SETTLED" : "PARTIALLY_SETTLED",
      });

      mappingRecords.push({
        id: uuidv4(),
        ledger_id: entry.id,
        allocated_amount: parseFloat(applied.toFixed(2)),
      });

      remaining = parseFloat((remaining - applied).toFixed(2));
    }

    // Safety check — should never happen if balance was validated
    if (remaining > 0.01) {
      throw new AppError(
        "FIFO distribution error: could not fully allocate the settlement amount",
        500,
      );
    }

    return { ledgerUpdates, mappingRecords };
  }

  /**
   * Default platform fee calculation.
   * Matches the OrderService logic (flat ₹10).
   *
   * @param {number} _orderAmount - Not used currently (flat fee).
   * @returns {number}
   */
  _calculatePlatformFee(_orderAmount) {
    return 10;
  }
}

export default SettlementService;
