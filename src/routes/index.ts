import { Router } from "express";
import userRoutes from "../public/user/user.routes";
import walletRoutes from "../public/wallet/wallet.routes";

const router = Router();

// User Auth & Profile Routes
router.use("/user", userRoutes);

// Wallet, Ledger & Admin Wallet Routes
router.use("/wallet", walletRoutes);

export default router;
