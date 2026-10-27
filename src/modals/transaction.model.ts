import mongoose, { Schema, Document } from "mongoose";

export interface ITransaction extends Document {
  userId: mongoose.Types.ObjectId;
  recipientId?: mongoose.Types.ObjectId;
  type: "DEPOSIT" | "TRANSFER" | "WITHDRAWAL" | "REVERSAL";
  status: "PENDING" | "COMPLETED" | "REJECTED" | "REVERSED";
  amount: number; // in whole paise
  fee: number; // in whole paise
  idempotencyKey?: string;
  description?: string;
  relatedTransactionId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const transactionSchema: Schema<ITransaction> = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    recipientId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    type: {
      type: String,
      enum: ["DEPOSIT", "TRANSFER", "WITHDRAWAL", "REVERSAL"],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "COMPLETED", "REJECTED", "REVERSED"],
      default: "PENDING",
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 1,
    },
    fee: {
      type: Number,
      default: 0,
      min: 0,
    },
    idempotencyKey: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    relatedTransactionId: {
      type: Schema.Types.ObjectId,
      ref: "Transaction",
    },
  },
  {
    timestamps: true,
  }
);

transactionSchema.index({ userId: 1, createdAt: -1 });

const Transaction = mongoose.model<ITransaction>("Transaction", transactionSchema);
export default Transaction;
