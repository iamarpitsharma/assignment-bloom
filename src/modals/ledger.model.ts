import mongoose, { Schema, Document } from "mongoose";

export interface ILedgerEntry extends Document {
  transactionId: mongoose.Types.ObjectId;
  userId?: mongoose.Types.ObjectId;
  account: "USER" | "FEE" | "CLEARING" | "BANK";
  amount: number; // in whole paise (positive = credit, negative = debit)
  description?: string;
  createdAt: Date;
}

const ledgerEntrySchema: Schema<ILedgerEntry> = new Schema(
  {
    transactionId: {
      type: Schema.Types.ObjectId,
      ref: "Transaction",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    account: {
      type: String,
      enum: ["USER", "FEE", "CLEARING", "BANK"],
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    description: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// Append-only: prevent edit and delete
const throwImmutableError = () => {
  throw new Error("Ledger entries are append-only and cannot be modified or deleted");
};
ledgerEntrySchema.pre("updateOne", throwImmutableError);
ledgerEntrySchema.pre("updateMany", throwImmutableError);
ledgerEntrySchema.pre("findOneAndUpdate", throwImmutableError);
ledgerEntrySchema.pre("deleteOne", throwImmutableError);
ledgerEntrySchema.pre("deleteMany", throwImmutableError);

const LedgerEntry = mongoose.model<ILedgerEntry>("LedgerEntry", ledgerEntrySchema);
export default LedgerEntry;
