import { z, ZodSchema } from "zod";
import { ApiError } from "./ApiError";

/**
 * Validates and sanitizes data against a Zod schema.
 * Throws an ApiError (400) with the first formatted error message if validation fails.
 */
export const validateData = <T>(schema: ZodSchema<T>, data: unknown): T => {
  const result = schema.safeParse(data);

  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const message = firstIssue?.message || "Validation failed";
    throw new ApiError(400, message);
  }

  return result.data;
};
