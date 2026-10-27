import { Request, Response, NextFunction } from "express";
import { config } from "../config/config";
import jwt from "jsonwebtoken";
import User from "../modals/user.model";

export type Role = "user" | "admin";

// Extend Express Request with typed user
export type AuthenticatedRequest = Request & {
  user?: {
    id: string;
    role: Role;
    email?: string;
  };
};

const secret = config.jwt.secret;

/**
 * Middleware to authenticate JWT token and attach user to request
 */
export const authenticateToken = (
  req: Request,
  res: Response,
  next: NextFunction
): any => {
  const token = req.header("Authorization")?.replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({
      status: false,
      message: "Access denied. No authentication token provided.",
    });
  }

  try {
    const decoded = jwt.verify(token, secret) as {
      id: string;
      role: string;
      email: string;
    };

    const normalizedRole =
      typeof decoded.role === "string" ? decoded.role.toLowerCase().trim() : decoded.role;

    (req as any).user = {
      id: decoded.id,
      role: (normalizedRole === "admin" ? "admin" : "user") as Role,
      email: decoded.email,
    };

    next();
  } catch (error) {
    return res.status(401).json({
      status: false,
      message: "Invalid or expired authentication token.",
    });
  }
};

/**
 * Allow all roles except the ones listed
 */
export const allowAllExcept =
  (...rolesToBlock: Role[]) =>
    (req: AuthenticatedRequest, res: Response, next: NextFunction): any => {
      const { user } = req;

      if (!user) {
        return res.status(401).json({
          status: false,
          message: "Unauthorized access. User not found.",
        });
      }

      if (rolesToBlock.includes(user.role)) {
        return res.status(403).json({
          status: false,
          message: `Access restricted. '${user.role}' role is not permitted on this route.`,
        });
      }

      next();
    };

/**
 * Allow only the listed roles
 */
export const allowOnly =
  (...allowedRoles: Role[]) =>
    (req: AuthenticatedRequest, res: Response, next: NextFunction): any => {
      const { user } = req;

      if (!user) {
        return res.status(401).json({
          status: false,
          message: "Unauthorized access. User not found.",
        });
      }

      if (!allowedRoles.includes(user.role)) {
        return res.status(403).json({
          status: false,
          message: `Access denied. Only [${allowedRoles.join(", ")}] roles are allowed.`,
          yourRole: user.role,
        });
      }

      next();
    };

/**
 * Middleware to check if the user has a specific role and exists in the DB
 */
export const checkRole =
  (requiredRole: Role) =>
    async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<any> => {
      const { user } = req;

      if (!user) {
        return res.status(401).json({
          status: false,
          message: "Unauthorized access. User not found.",
        });
      }

      if (user.role !== requiredRole) {
        return res.status(403).json({
          status: false,
          message: `Access denied. '${user.role}' role cannot access this route.`,
          expectedRole: requiredRole,
          yourRole: user.role,
        });
      }

      const existingUser = await User.findById(user.id);
      if (!existingUser) {
        return res.status(404).json({
          status: false,
          message: `'${requiredRole}' account not found in the system.`,
        });
      }

      next();
    };

// ✅ Export reusable role-based middlewares
export const isUser = checkRole("user");
export const isAdmin = checkRole("admin");

