import { Router } from "express";
import { UserController } from "./user.controller";
import { asyncHandler } from "../../utils/asyncHandler";
import { authenticateToken, isAdmin } from "../../middlewares/authMiddleware";

const router = Router();

// Public auth routes
router.post("/register", asyncHandler(UserController.createUser));
router.post("/login", asyncHandler(UserController.loginUser));
router.post("/", asyncHandler(UserController.createUser));

// Authenticated profile routes
router.get("/me", authenticateToken, asyncHandler(UserController.getCurrentUser));
router.get("/current/user", authenticateToken, asyncHandler(UserController.getCurrentUser));

// User management routes
router.get("/", authenticateToken, asyncHandler(UserController.getUsers));
router.get("/:id", authenticateToken, asyncHandler(UserController.getUserById));
router.put("/:id", authenticateToken, asyncHandler(UserController.updateUser));
router.delete("/:id", authenticateToken, isAdmin, asyncHandler(UserController.deleteUser));

export default router;
