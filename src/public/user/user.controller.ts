import { Request, Response } from "express";
import User, { IUser } from "../../modals/user.model";
import { UserService } from "./user.service";
import { CommonService } from "../../services/common.services";
import ApiResponse from "../../utils/ApiResponse";
import { ApiError } from "../../utils/ApiError";

const userService = new CommonService<IUser>(User);

export class UserController {
  /**
   * Register or Create a new User / Admin
   */
  static async createUser(req: Request, res: Response) {
    const result = await UserService.createUser(req.body);
    return res
      .status(201)
      .json(new ApiResponse(201, result, `${result.user.role} created successfully`));
  }

  /**
   * Login for both User and Admin
   */
  static async loginUser(req: Request, res: Response) {
    const result = await UserService.loginUser(req.body);
    return res.status(200).json(new ApiResponse(200, result, "Login successful"));
  }

  /**
   * Get current authenticated user details
   */
  static async getCurrentUser(req: Request, res: Response) {
    const userId = (req as any).user?.id;
    const user = await User.findById(userId).select("-password");

    if (!user) {
      throw new ApiError(404, "User not found");
    }

    return res
      .status(200)
      .json(new ApiResponse(200, user, "User profile fetched successfully"));
  }

  /**
   * Get all users with pagination, filters, and search
   */
  static async getUsers(req: Request, res: Response) {
    const users = await userService.getAll(req.query);
    return res
      .status(200)
      .json(new ApiResponse(200, users, "Users fetched successfully"));
  }

  /**
   * Get user by ID
   */
  static async getUserById(req: Request, res: Response) {
    const id = String(req.params.id);
    const user = await User.findById(id).select("-password");
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    return res
      .status(200)
      .json(new ApiResponse(200, user, "User fetched successfully"));
  }

  /**
   * Update user by ID
   */
  static async updateUser(req: Request, res: Response) {
    const id = String(req.params.id);
    const updatedUser = await UserService.updateUser(id, req.body);
    return res
      .status(200)
      .json(new ApiResponse(200, updatedUser, "User updated successfully"));
  }

  /**
   * Delete user by ID
   */
  static async deleteUser(req: Request, res: Response) {
    const id = String(req.params.id);
    const user = await userService.deleteById(id);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    return res
      .status(200)
      .json(new ApiResponse(200, null, "User deleted successfully"));
  }
}
