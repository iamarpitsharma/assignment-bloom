import { Router } from "express";
import { WalletController } from "./wallet.controller";
import { asyncHandler } from "../../utils/asyncHandler";
import { authenticateToken, isAdmin } from "../../middlewares/authMiddleware";

const router = Router();

// ==========================================
// USER WALLET ROUTES (Authenticated User)
// ==========================================

// View wallet balance
router.get("/balance", authenticateToken, asyncHandler(WalletController.getBalance));

// Add money (simulated deposit)
router.post("/deposit", authenticateToken, asyncHandler(WalletController.deposit));

// Transfer money to another user
router.post("/transfer", authenticateToken, asyncHandler(WalletController.transfer));

// Request a withdrawal
router.post("/withdraw", authenticateToken, asyncHandler(WalletController.requestWithdrawal));

// View own transaction history with pagination
router.get("/transactions", authenticateToken, asyncHandler(WalletController.getMyTransactions));

// View single transaction details
router.get("/transactions/:id", authenticateToken, asyncHandler(WalletController.getTransactionById));

// ==========================================
// ADMIN WALLET ROUTES (Admin Role Only)
// ==========================================

// View pending withdrawal requests
router.get(
  "/admin/pending-withdrawals",
  authenticateToken,
  isAdmin,
  asyncHandler(WalletController.getPendingWithdrawals)
);

// Approve a withdrawal request
router.post(
  "/admin/withdrawals/:id/approve",
  authenticateToken,
  isAdmin,
  asyncHandler(WalletController.approveWithdrawal)
);

// Reject a withdrawal request
router.post(
  "/admin/withdrawals/:id/reject",
  authenticateToken,
  isAdmin,
  asyncHandler(WalletController.rejectWithdrawal)
);

// Reverse a completed transfer (creates compensating ledger entries)
router.post(
  "/admin/transfers/:id/reverse",
  authenticateToken,
  isAdmin,
  asyncHandler(WalletController.reverseTransfer)
);

// View all transactions system-wide with pagination
router.get(
  "/admin/transactions",
  authenticateToken,
  isAdmin,
  asyncHandler(WalletController.getAllTransactions)
);

// View system-wide append-only ledger entries for audit
router.get(
  "/admin/ledger",
  authenticateToken,
  isAdmin,
  asyncHandler(WalletController.getAllLedgerEntries)
);

export default router;
