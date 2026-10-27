import mongoose from "mongoose";
import User from "../../modals/user.model";
import Transaction, { ITransaction } from "../../modals/transaction.model";
import { LedgerService } from "../../services/ledger.service";
import { ApiError } from "../../utils/ApiError";
import { validateData } from "../../utils/validate";
import {
  depositSchema,
  transferSchema,
  withdrawalRequestSchema,
  rejectWithdrawalSchema,
  reverseTransferSchema,
} from "./wallet.validation";

export class WalletService {
  /**
   * 1% transfer fee, min ₹1 (100 paise), max ₹20 (2,000 paise)
   */
  static calculateFee(amountInPaise: number): number {
    return Math.min(2000, Math.max(100, Math.floor(amountInPaise * 0.01)));
  }

  /**
   * Get user wallet balances (in whole paise and rupees)
   */
  static async getBalance(userId: string) {
    const user = await User.findById(userId);
    if (!user) throw new ApiError(404, "User not found");

    const wallet = user.wallet || 0;
    const lockedBalance = user.lockedBalance || 0;
    const availableBalance = Math.max(0, wallet - lockedBalance);

    return {
      wallet,
      lockedBalance,
      availableBalance,
      walletInRupees: (wallet / 100).toFixed(2),
      lockedInRupees: (lockedBalance / 100).toFixed(2),
      availableInRupees: (availableBalance / 100).toFixed(2),
    };
  }

  /**
   * Simulated deposit with idempotency and balanced ledger entry
   */
  static async deposit(userId: string, data: unknown) {
    const { amount, idempotencyKey } = validateData(depositSchema, data);

    if (idempotencyKey) {
      const existing = await Transaction.findOne({ idempotencyKey, type: "DEPOSIT" });
      if (existing) {
        if (existing.amount !== amount) {
          throw new ApiError(
            409,
            `Idempotency conflict: key '${idempotencyKey}' was already used for a deposit of ₹${(
              existing.amount / 100
            ).toFixed(2)}.`
          );
        }
        return {
          transaction: existing,
          balance: await WalletService.getBalance(userId),
          isDuplicate: true,
        };
      }
    }

    const user = await User.findByIdAndUpdate(userId, { $inc: { wallet: amount } }, { new: true });
    if (!user) throw new ApiError(404, "User not found");

    const transaction = await Transaction.create({
      userId: user._id,
      type: "DEPOSIT",
      status: "COMPLETED",
      amount,
      idempotencyKey,
      description: `Deposit of ₹${(amount / 100).toFixed(2)}`,
    });

    await LedgerService.record([
      { transactionId: transaction._id, userId: user._id, account: "USER", amount, description: "Deposit credit" },
      { transactionId: transaction._id, account: "CLEARING", amount: -amount, description: "Clearing debit" },
    ]);

    return { transaction, balance: await WalletService.getBalance(userId) };
  }

  /**
   * Transfer to another user:
   * - Daily limit ₹50,000
   * - 1% fee (₹1-₹20) paid by sender
   * - Concurrency-safe atomic deduction
   * - Balanced append-only ledger entries
   */
  static async transfer(senderId: string, data: unknown) {
    const { recipient, amount, description, idempotencyKey } = validateData(transferSchema, data);

    if (idempotencyKey) {
      const existing = await Transaction.findOne({ idempotencyKey, type: "TRANSFER" });
      if (existing) {
        if (existing.amount !== amount) {
          throw new ApiError(
            409,
            `Idempotency conflict: key '${idempotencyKey}' was already used for a transfer of ₹${(
              existing.amount / 100
            ).toFixed(2)}.`
          );
        }
        return {
          transaction: existing,
          balance: await WalletService.getBalance(senderId),
          isDuplicate: true,
        };
      }
    }

    // Daily limit check: max ₹50,000 (5,000,000 paise)
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const dailyTxns = await Transaction.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(senderId),
          type: "TRANSFER",
          status: "COMPLETED",
          createdAt: { $gte: startOfDay },
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    const transferredToday = dailyTxns[0]?.total || 0;
    if (transferredToday + amount > 5000000) {
      throw new ApiError(
        400,
        `Daily transfer limit of ₹50,000 exceeded. Already transferred ₹${(transferredToday / 100).toFixed(2)} today.`
      );
    }

    // Resolve recipient user
    const recipientUser = await User.findOne(
      mongoose.Types.ObjectId.isValid(recipient)
        ? { _id: recipient }
        : {
            $or: [
              { username: recipient.toLowerCase().trim() },
              { email: recipient.toLowerCase().trim() },
            ],
          }
    );

    if (!recipientUser) throw new ApiError(404, "Recipient user not found");
    if (!recipientUser.status) throw new ApiError(400, "Recipient account is deactivated");
    if (recipientUser._id.toString() === senderId) {
      throw new ApiError(400, "Cannot transfer money to yourself");
    }

    const fee = WalletService.calculateFee(amount);
    const totalDebit = amount + fee;

    // Concurrency-safe atomic deduction (sender available balance >= totalDebit)
    const sender = await User.findOneAndUpdate(
      {
        _id: senderId,
        $expr: { $gte: [{ $subtract: ["$wallet", "$lockedBalance"] }, totalDebit] },
      },
      { $inc: { wallet: -totalDebit } },
      { new: true }
    );

    if (!sender) {
      throw new ApiError(
        400,
        `Insufficient available balance. Transfer requires ₹${(totalDebit / 100).toFixed(2)} (including ₹${(fee / 100).toFixed(2)} fee)`
      );
    }

    // Credit recipient
    await User.findByIdAndUpdate(recipientUser._id, { $inc: { wallet: amount } });

    const transaction = await Transaction.create({
      userId: sender._id,
      recipientId: recipientUser._id,
      type: "TRANSFER",
      status: "COMPLETED",
      amount,
      fee,
      idempotencyKey,
      description: description || `Transfer to ${recipientUser.username}`,
    });

    await LedgerService.record([
      { transactionId: transaction._id, userId: sender._id, account: "USER", amount: -totalDebit, description: "Transfer debit" },
      { transactionId: transaction._id, userId: recipientUser._id, account: "USER", amount, description: "Transfer credit" },
      { transactionId: transaction._id, account: "FEE", amount: fee, description: "Platform fee" },
    ]);

    return {
      transaction,
      balance: await WalletService.getBalance(senderId),
      fee: { amount, fee, totalDebited: totalDebit },
    };
  }

  /**
   * Request withdrawal: locks funds into lockedBalance
   */
  static async requestWithdrawal(userId: string, data: unknown) {
    const { amount, idempotencyKey } = validateData(withdrawalRequestSchema, data);

    if (idempotencyKey) {
      const existing = await Transaction.findOne({ idempotencyKey, type: "WITHDRAWAL" });
      if (existing) {
        if (existing.amount !== amount) {
          throw new ApiError(
            409,
            `Idempotency conflict: key '${idempotencyKey}' was already used for a withdrawal of ₹${(
              existing.amount / 100
            ).toFixed(2)}. Please use a new idempotency key.`
          );
        }
        return {
          transaction: existing,
          balance: await WalletService.getBalance(userId),
          isDuplicate: true,
        };
      }
    }

    // Atomically lock funds from available balance
    const user = await User.findOneAndUpdate(
      {
        _id: userId,
        $expr: { $gte: [{ $subtract: ["$wallet", "$lockedBalance"] }, amount] },
      },
      { $inc: { lockedBalance: amount } },
      { new: true }
    );

    if (!user) {
      throw new ApiError(400, "Insufficient available balance to reserve for withdrawal");
    }

    const transaction = await Transaction.create({
      userId: user._id,
      type: "WITHDRAWAL",
      status: "PENDING",
      amount,
      idempotencyKey,
      description: `Withdrawal request of ₹${(amount / 100).toFixed(2)}`,
    });

    return { transaction, balance: await WalletService.getBalance(userId) };
  }

  /**
   * Admin: Approve withdrawal request
   */
  static async approveWithdrawal(transactionId: string) {
    const txn = await Transaction.findOneAndUpdate(
      { _id: transactionId, type: "WITHDRAWAL", status: "PENDING" },
      { status: "COMPLETED" },
      { new: true }
    );
    if (!txn) {
      throw new ApiError(400, "Withdrawal request not found or already processed");
    }

    // Deduct both wallet balance and lockedBalance
    await User.findByIdAndUpdate(txn.userId, {
      $inc: { wallet: -txn.amount, lockedBalance: -txn.amount },
    });

    await LedgerService.record([
      { transactionId: txn._id, userId: txn.userId, account: "USER", amount: -txn.amount, description: "Withdrawal debit" },
      { transactionId: txn._id, account: "BANK", amount: txn.amount, description: "Bank payout" },
    ]);

    return txn;
  }

  /**
   * Admin: Reject withdrawal request and release locked funds
   */
  static async rejectWithdrawal(transactionId: string, data: unknown) {
    const { reason } = validateData(rejectWithdrawalSchema, data);

    const txn = await Transaction.findOneAndUpdate(
      { _id: transactionId, type: "WITHDRAWAL", status: "PENDING" },
      {
        status: "REJECTED",
        description: reason ? `Rejected: ${reason}` : "Withdrawal rejected",
      },
      { new: true }
    );
    if (!txn) {
      throw new ApiError(400, "Withdrawal request not found or already processed");
    }

    // Release locked balance
    await User.findByIdAndUpdate(txn.userId, { $inc: { lockedBalance: -txn.amount } });

    return txn;
  }

  /**
   * Admin: Reverse completed transfer
   */
  static async reverseTransfer(transactionId: string, data: unknown) {
    const { reason } = validateData(reverseTransferSchema, data);

    const originalTxn = await Transaction.findOneAndUpdate(
      { _id: transactionId, type: "TRANSFER", status: "COMPLETED" },
      { status: "REVERSED" },
      { new: true }
    );
    if (!originalTxn) {
      throw new ApiError(400, "Transfer not found, not completed, or already reversed");
    }

    // Clawback from recipient
    const recipient = await User.findOneAndUpdate(
      {
        _id: originalTxn.recipientId,
        $expr: { $gte: [{ $subtract: ["$wallet", "$lockedBalance"] }, originalTxn.amount] },
      },
      { $inc: { wallet: -originalTxn.amount } },
      { new: true }
    );

    if (!recipient) {
      // Rollback status
      await Transaction.findByIdAndUpdate(originalTxn._id, { status: "COMPLETED" });
      throw new ApiError(400, "Cannot reverse transfer: Recipient has insufficient available balance");
    }

    const totalRefund = originalTxn.amount + originalTxn.fee;
    // Refund sender
    await User.findByIdAndUpdate(originalTxn.userId, { $inc: { wallet: totalRefund } });

    const reversalTxn = await Transaction.create({
      userId: originalTxn.userId,
      recipientId: originalTxn.recipientId,
      type: "REVERSAL",
      status: "COMPLETED",
      amount: originalTxn.amount,
      fee: originalTxn.fee,
      relatedTransactionId: originalTxn._id,
      description: reason ? `Reversed: ${reason}` : `Reversal of Transfer #${originalTxn._id}`,
    });

    await LedgerService.record([
      { transactionId: reversalTxn._id, userId: originalTxn.userId, account: "USER", amount: totalRefund, description: "Transfer reversal refund" },
      { transactionId: reversalTxn._id, userId: originalTxn.recipientId, account: "USER", amount: -originalTxn.amount, description: "Transfer clawback" },
      { transactionId: reversalTxn._id, account: "FEE", amount: -originalTxn.fee, description: "Fee reversal" },
    ]);

    return { originalTransaction: originalTxn, reversalTransaction: reversalTxn };
  }
}
