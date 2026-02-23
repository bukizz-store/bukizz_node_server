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
  //  LEDGER ENTRY CREATION
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Create the multi-line ledger entries that accompany a completed order.
   *
   * For every order we insert TWO immutable rows:
   *   1. ORDER_REVENUE  (CREDIT) — the retailer's share of the sale.
   *   2. PLATFORM_FEE   (DEBIT)  — Bukizz's commission deducted from the retailer.
   *
   * Both rows start with status ON_HOLD (released later by a scheduler or admin).
   *
   * @param {Object} params
   * @param {string} params.orderId
   * @param {string} params.retailerId
   * @param {string} params.warehouseId
   * @param {number} params.orderAmount      - Total order amount (including delivery, before platform fee).
   * @param {number} params.platformFeeAmount - The platform commission to deduct.
   * @param {string} [params.notes]
   * @returns {Promise<Array<Object>>} The two inserted ledger rows.
   */
  async createOrderLedgerEntries({
    orderId,
    retailerId,
    warehouseId,
    orderAmount,
    platformFeeAmount,
    notes = null,
  }) {
    try {
      if (!orderId || !retailerId || !orderAmount) {
        throw new AppError(
          "orderId, retailerId, and orderAmount are required to create ledger entries",
          400,
        );
      }

      if (orderAmount <= 0) {
        throw new AppError("orderAmount must be positive", 400);
      }

      const now = new Date().toISOString();
      const fee = platformFeeAmount ?? this._calculatePlatformFee(orderAmount);

      const entries = [
        {
          id: uuidv4(),
          retailer_id: retailerId,
          warehouse_id: warehouseId || null,
          order_id: orderId,
          transaction_type: "ORDER_REVENUE",
          entry_type: "CREDIT",
          amount: orderAmount,
          settled_amount: 0,
          status: "ON_HOLD",
          trigger_date: now,
          notes: notes || `Revenue for order ${orderId}`,
          created_at: now,
        },
        {
          id: uuidv4(),
          retailer_id: retailerId,
          warehouse_id: warehouseId || null,
          order_id: orderId,
          transaction_type: "PLATFORM_FEE",
          entry_type: "DEBIT",
          amount: fee,
          settled_amount: 0,
          status: "ON_HOLD",
          trigger_date: now,
          notes: notes || `Platform fee for order ${orderId}`,
          created_at: now,
        },
      ];

      const result = await this.ledgerRepository.createEntries(entries);

      logger.info("Multi-line ledger entries created for order", {
        orderId,
        retailerId,
        revenue: orderAmount,
        platformFee: fee,
      });

      return result;
    } catch (error) {
      logger.error("Error creating order ledger entries:", error);
      throw error;
    }
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
        amount,
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
        amount_applied: parseFloat(applied.toFixed(2)),
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
