import { z } from "zod";

/**
 * Standardized role schema with automated trimming, lowercasing, and validation
 */
export const roleSchema = z
  .preprocess(
    (val) => (typeof val === "string" ? val.trim().toLowerCase() : val),
    z.enum(["user", "admin"], {
      errorMap: () => ({ message: "Invalid role. Role must be 'user' or 'admin'" }),
    })
  )
  .default("user");

/**
 * Schema for User / Admin registration
 */
export const createUserSchema = z.object({
  name: z
    .string({ required_error: "Name is required" })
    .trim()
    .min(1, "Name cannot be empty"),

  username: z
    .string({ required_error: "Username is required" })
    .trim()
    .toLowerCase()
    .min(3, "Username must be at least 3 characters"),

  email: z
    .string({ required_error: "Email is required" })
    .trim()
    .toLowerCase()
    .email("Invalid email address"),

  password: z
    .string({ required_error: "Password is required" })
    .min(6, "Password must be at least 6 characters"),

  phone: z.string().trim().optional(),

  role: roleSchema,

  status: z
    .preprocess((val) => {
      if (val === undefined || val === null) return true;
      if (val === "active" || val === true || val === "true") return true;
      if (val === "inactive" || val === false || val === "false") return false;
      return Boolean(val);
    }, z.boolean())
    .default(true),
});

/**
 * Schema for User / Admin login
 */
export const loginUserSchema = z
  .object({
    email: z.string().trim().toLowerCase().optional(),
    username: z.string().trim().toLowerCase().optional(),
    password: z
      .string({ required_error: "Password is required" })
      .min(1, "Password is required"),
  })
  .refine((data) => Boolean(data.email || data.username), {
    message: "Email or username is required",
    path: ["email"],
  });

/**
 * Schema for User update (strictly prohibits modifying role)
 */
export const updateUserSchema = z
  .object({
    name: z.string().trim().min(1, "Name cannot be empty").optional(),

    username: z
      .string()
      .trim()
      .toLowerCase()
      .min(3, "Username must be at least 3 characters")
      .optional(),

    phone: z.string().trim().optional(),

    status: z
      .preprocess((val) => {
        if (val === undefined || val === null) return undefined;
        if (val === "active" || val === true || val === "true") return true;
        if (val === "inactive" || val === false || val === "false") return false;
        return Boolean(val);
      }, z.boolean().optional())
      .optional(),

    role: z.any().optional(),
  })
  .refine((data) => data.role === undefined, {
    message: "Role modification is not allowed",
    path: ["role"],
  });

// Inferred TypeScript types from Zod schemas
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type LoginUserInput = z.infer<typeof loginUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
