import mongoose from "mongoose";
import LedgerEntry, { ILedgerEntry } from "../modals/ledger.model";
import { ApiError } from "../utils/ApiError";

export interface LedgerItem {
  transactionId: mongoose.Types.ObjectId | string;
  userId?: mongoose.Types.ObjectId | string;
  account: "USER" | "FEE" | "CLEARING" | "BANK";
  amount: number; // in whole paise (positive = credit, negative = debit)
  description?: string;
}

export class LedgerService {
  /**
   * Appends double-entry ledger records ensuring they balance to zero
   */
  static async record(entries: LedgerItem[]): Promise<ILedgerEntry[]> {
    const sum = entries.reduce((acc, curr) => acc + Math.floor(curr.amount), 0);
    if (sum !== 0) {
      throw new ApiError(
        500,
        `Ledger integrity error: entries must balance to zero (net difference: ${sum})`
      );
    }

    return LedgerEntry.insertMany(
      entries.map((e) => ({ ...e, amount: Math.floor(e.amount) }))
    ) as unknown as ILedgerEntry[];
  }
}
