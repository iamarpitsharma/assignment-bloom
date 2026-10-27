import { Request, Response } from "express";
import Transaction, { ITransaction } from "../../modals/transaction.model";
import LedgerEntry, { ILedgerEntry } from "../../modals/ledger.model";
import { WalletService } from "./wallet.service";
import { CommonService } from "../../services/common.services";
import ApiResponse from "../../utils/ApiResponse";
import { ApiError } from "../../utils/ApiError";

const transactionService = new CommonService<ITransaction>(Transaction);
const ledgerService = new CommonService<ILedgerEntry>(LedgerEntry);

export class WalletController {
  /**
   * User: View wallet balance
   */
  static async getBalance(req: Request, res: Response) {
    const userId = (req as any).user?.id;
    const balance = await WalletService.getBalance(userId);
    return res
      .status(200)
      .json(new ApiResponse(200, balance, "Balance fetched successfully"));
  }

  /**
   * User: Add money via simulated payment
   */
  static async deposit(req: Request, res: Response) {
    const userId = (req as any).user?.id;
    const idempotencyKey =
      (req.headers["x-idempotency-key"] as string) || req.body.idempotencyKey;

    const result = await WalletService.deposit(userId, { ...req.body, idempotencyKey });
    const isDup = (result as any).isDuplicate;
    const status = isDup ? 200 : 201;
    const message = isDup
      ? "Existing deposit returned (idempotent replay)"
      : "Deposit completed successfully";
    return res.status(status).json(new ApiResponse(status, result, message));
  }

  /**
   * User: Transfer money to another user
   */
  static async transfer(req: Request, res: Response) {
    const senderId = (req as any).user?.id;
    const idempotencyKey =
      (req.headers["x-idempotency-key"] as string) || req.body.idempotencyKey;

    const result = await WalletService.transfer(senderId, { ...req.body, idempotencyKey });
    const isDup = (result as any).isDuplicate;
    const status = isDup ? 200 : 201;
    const message = isDup
      ? "Existing transfer returned (idempotent replay)"
      : "Transfer completed successfully";
    return res.status(status).json(new ApiResponse(status, result, message));
  }

  /**
   * User: Request a withdrawal
   */
  static async requestWithdrawal(req: Request, res: Response) {
    const userId = (req as any).user?.id;
    const idempotencyKey =
      (req.headers["x-idempotency-key"] as string) || req.body.idempotencyKey;

    const result = await WalletService.requestWithdrawal(userId, { ...req.body, idempotencyKey });
    const isDup = (result as any).isDuplicate;
    const status = isDup ? 200 : 201;
    const message = isDup
      ? "Existing withdrawal returned (idempotent replay)"
      : "Withdrawal request submitted";
    return res.status(status).json(new ApiResponse(status, result, message));
  }

  /**
   * User: View own transaction history with pagination
   */
  static async getMyTransactions(req: Request, res: Response) {
    const userId = (req as any).user?.id;
    const history = await transactionService.getAll({ ...req.query, userId });
    return res
      .status(200)
      .json(new ApiResponse(200, history, "Transactions fetched successfully"));
  }

  /**
   * User/Admin: View single transaction by ID
   */
  static async getTransactionById(req: Request, res: Response) {
    const id = String(req.params.id);
    const currentUser = (req as any).user;
    const transaction = await Transaction.findById(id).populate(
      "recipientId",
      "name username email"
    );

    if (!transaction) {
      throw new ApiError(404, "Transaction not found");
    }

    const isOwner =
      transaction.userId.toString() === currentUser.id ||
      transaction.recipientId?.toString() === currentUser.id;

    if (!isOwner && currentUser.role !== "admin") {
      throw new ApiError(403, "Access denied to transaction");
    }

    return res
      .status(200)
      .json(new ApiResponse(200, transaction, "Transaction fetched successfully"));
  }

  // ==========================================
  // ADMIN CONTROLLER ENDPOINTS
  // ==========================================

  /**
   * Admin: View pending withdrawal requests with pagination
   */
  static async getPendingWithdrawals(req: Request, res: Response) {
    const result = await transactionService.getAll({
      ...req.query,
      type: "WITHDRAWAL",
      status: "PENDING",
    });
    return res
      .status(200)
      .json(new ApiResponse(200, result, "Pending withdrawals fetched"));
  }

  /**
   * Admin: Approve a withdrawal request
   */
  static async approveWithdrawal(req: Request, res: Response) {
    const id = String(req.params.id);
    const result = await WalletService.approveWithdrawal(id);
    return res
      .status(200)
      .json(new ApiResponse(200, result, "Withdrawal approved successfully"));
  }

  /**
   * Admin: Reject a withdrawal request
   */
  static async rejectWithdrawal(req: Request, res: Response) {
    const id = String(req.params.id);
    const result = await WalletService.rejectWithdrawal(id, req.body);
    return res
      .status(200)
      .json(new ApiResponse(200, result, "Withdrawal rejected"));
  }

  /**
   * Admin: Reverse a completed transfer
   */
  static async reverseTransfer(req: Request, res: Response) {
    const id = String(req.params.id);
    const result = await WalletService.reverseTransfer(id, req.body);
    return res
      .status(200)
      .json(new ApiResponse(200, result, "Transfer reversed successfully"));
  }

  /**
   * Admin: View all transactions system-wide with pagination
   */
  static async getAllTransactions(req: Request, res: Response) {
    const result = await transactionService.getAll(req.query);
    return res
      .status(200)
      .json(new ApiResponse(200, result, "All transactions fetched"));
  }

  /**
   * Admin: View system-wide append-only ledger entries with pagination
   */
  static async getAllLedgerEntries(req: Request, res: Response) {
    const result = await ledgerService.getAll(req.query);
    return res
      .status(200)
      .json(new ApiResponse(200, result, "Ledger audit entries fetched"));
  }
}
