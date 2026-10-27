import bcrypt from "bcrypt";
import mongoose, { Schema, Document } from "mongoose";

export interface IUser extends Document {
  name: string;
  username: string;
  email: string;
  password: string;
  phone?: string;
  role: "user" | "admin";
  status: boolean;
  wallet: number;
  lockedBalance: number;
  availableBalance?: number;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(password: string): Promise<boolean>;
}

const userSchema: Schema<IUser> = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      required: true,
      minlength: 6,
    },

    phone: {
      type: String,
      trim: true,
    },

    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
      lowercase: true,
      trim: true,
    },

    status: {
      type: Boolean,
      default: true,
    },

    // Total balance in whole paise (integer)
    wallet: {
      type: Number,
      default: 0,
      min: 0,
      set: (v: number) => Math.floor(v),
    },

    // Amount reserved for pending withdrawals in whole paise (integer)
    lockedBalance: {
      type: Number,
      default: 0,
      min: 0,
      set: (v: number) => Math.floor(v),
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual field for available balance (wallet - lockedBalance)
userSchema.virtual("availableBalance").get(function (this: IUser) {
  return Math.max(0, (this.wallet || 0) - (this.lockedBalance || 0));
});

// 🔒 Pre-save hook to hash password if modified
userSchema.pre<IUser>("save", async function (next) {
  if (!this.isModified("password")) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    return next();
  } catch (err) {
    return next(err as Error);
  }
});

// 🔐 Method to compare password during login
userSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model<IUser>("User", userSchema);

export default User;