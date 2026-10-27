import User, { IUser } from "../../modals/user.model";
import { generateAccessToken } from "../../utils/token";
import { ApiError } from "../../utils/ApiError";
import { validateData } from "../../utils/validate";
import {
  createUserSchema,
  loginUserSchema,
  updateUserSchema,
  CreateUserInput,
  LoginUserInput,
  UpdateUserInput,
} from "./user.validation";

export { CreateUserInput, LoginUserInput, UpdateUserInput };

export class UserService {
  /**
   * Helper to format sanitized user data for API responses
   */
  static sanitizeUser(user: IUser | any) {
    const wallet = user.wallet || 0;
    const lockedBalance = user.lockedBalance || 0;
    return {
      _id: user._id,
      name: user.name,
      username: user.username,
      email: user.email,
      phone: user.phone,
      role: user.role,
      status: user.status,
      wallet,
      lockedBalance,
      availableBalance: Math.max(0, wallet - lockedBalance),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  /**
   * Register or Create a User / Admin
   */
  static async createUser(data: unknown) {
    // Zod handles automated trimming, lowercasing, and role validation
    const validated = validateData(createUserSchema, data);

    // Check if email or username already taken
    const existingUser = await User.findOne({
      $or: [
        { email: validated.email },
        { username: validated.username },
      ],
    });

    if (existingUser) {
      if (existingUser.email === validated.email) {
        throw new ApiError(409, "User with this email already exists");
      }
      throw new ApiError(409, "User with this username already exists");
    }

    const user = new User({
      ...validated,
      wallet: 0,
    });

    await user.save();

    const token = generateAccessToken({
      id: user._id.toString(),
      email: user.email,
      role: user.role,
    });

    return {
      user: UserService.sanitizeUser(user),
      token,
    };
  }

  /**
   * Login user with email/username and password
   */
  static async loginUser(data: unknown) {
    // Zod sanitizes and guarantees password and either email or username
    const validated = validateData(loginUserSchema, data);
    const identifier = validated.email || validated.username;

    const user = await User.findOne({
      $or: [{ email: identifier }, { username: identifier }],
    });

    if (!user) {
      throw new ApiError(401, "Invalid credentials");
    }

    if (!user.status) {
      throw new ApiError(403, "Your account has been deactivated");
    }

    const isMatch = await user.comparePassword(validated.password);
    if (!isMatch) {
      throw new ApiError(401, "Invalid credentials");
    }

    const token = generateAccessToken({
      id: user._id.toString(),
      email: user.email,
      role: user.role,
    });

    return {
      user: UserService.sanitizeUser(user),
      token,
    };
  }

  /**
   * Update user by ID
   */
  static async updateUser(id: string, data: unknown) {
    // Zod validates and strictly forbids role modification
    const validated = validateData(updateUserSchema, data);

    if (validated.username) {
      const existing = await User.findOne({
        username: validated.username,
        _id: { $ne: id },
      });
      if (existing) {
        throw new ApiError(409, "User with this username already exists");
      }
    }

    const updatedUser = await User.findByIdAndUpdate(id, validated, {
      new: true,
      runValidators: true,
    }).select("-password");

    if (!updatedUser) {
      throw new ApiError(404, "User not found");
    }

    return UserService.sanitizeUser(updatedUser);
  }
}
