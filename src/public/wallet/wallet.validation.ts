import { z } from "zod";

/**
 * Common schema for amount in whole paise
 */
export const paiseAmountSchema = z
  .number({ required_error: "Amount is required" })
  .int("Amount must be a whole integer in paise")
  .positive("Amount must be a positive integer in paise");

/**
 * Deposit validation schema (simulated payment)
 */
export const depositSchema = z.object({
  amount: paiseAmountSchema.min(100, "Minimum deposit amount is ₹1 (100 paise)"),
  idempotencyKey: z.string().trim().min(1).optional(),
  paymentReference: z.string().trim().optional(),
});

/**
 * Money transfer validation schema
 * Sender pays 1% fee (min ₹1 = 100 paise, max ₹20 = 2000 paise)
 * Max per transfer: ₹25,000 (2,500,000 paise)
 */
export const transferSchema = z.object({
  recipient: z
    .string({ required_error: "Recipient (username, email, or user ID) is required" })
    .trim()
    .min(1, "Recipient cannot be empty"),
  amount: paiseAmountSchema
    .min(100, "Minimum transfer amount is ₹1 (100 paise)")
    .max(2500000, "Maximum transfer amount per transaction is ₹25,000 (2,500,000 paise)"),
  description: z.string().trim().max(255).optional(),
  idempotencyKey: z.string().trim().min(1).optional(),
});

/**
 * Withdrawal request validation schema
 */
export const withdrawalRequestSchema = z.object({
  amount: paiseAmountSchema.min(100, "Minimum withdrawal amount is ₹1 (100 paise)"),
  bankDetails: z
    .object({
      accountNumber: z.string().trim().min(6).optional(),
      ifscCode: z.string().trim().min(4).optional(),
      accountHolderName: z.string().trim().min(2).optional(),
      bankName: z.string().trim().optional(),
    })
    .optional(),
  idempotencyKey: z.string().trim().min(1).optional(),
});

/**
 * Admin reject withdrawal schema
 */
export const rejectWithdrawalSchema = z.object({
  reason: z.string().trim().min(1, "Rejection reason is required").optional(),
});

/**
 * Admin reverse transfer schema
 */
export const reverseTransferSchema = z.object({
  reason: z.string().trim().optional(),
});

export type DepositInput = z.infer<typeof depositSchema>;
export type TransferInput = z.infer<typeof transferSchema>;
export type WithdrawalRequestInput = z.infer<typeof withdrawalRequestSchema>;
export type RejectWithdrawalInput = z.infer<typeof rejectWithdrawalSchema>;
export type ReverseTransferInput = z.infer<typeof reverseTransferSchema>;
