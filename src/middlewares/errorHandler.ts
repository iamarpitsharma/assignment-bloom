import { logger } from "../config/logger";
import { config as manualConfig } from "../config/config";
import { Request, Response, NextFunction } from "express";

const toReadableFieldName = (field: string): string => {
  const withSpaces = field
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
};

const getDuplicateKeyErrorDetails = (
  err: any,
): { statusCode: number; message: string } | null => {
  if (err?.code !== 11000) return null;

  const keyValue =
    err?.keyValue && typeof err.keyValue === "object" ? err.keyValue : {};
  const duplicateField = Object.keys(keyValue)[0];

  if (duplicateField) {
    return {
      statusCode: 409,
      message: `${toReadableFieldName(duplicateField)} already exists`,
    };
  }

  return {
    statusCode: 409,
    message: "Duplicate value already exists",
  };
};

export const globalErrorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const duplicateKeyError = getDuplicateKeyErrorDetails(err);
  const statusCode =
    duplicateKeyError?.statusCode || err.statusCode || err.status || 500;
  const message = duplicateKeyError?.message || err.message || "Internal Server Error";

  // Log detailed error info with request path and method
  logger.error(
    `[${new Date().toISOString()}] Error on ${req.method} ${req.originalUrl
    } - Status: ${statusCode} - Message: ${message}`,
    {
      code: err?.code,
      keyValue: err?.keyValue,
      originalMessage: err?.message,
      stack: err?.stack,
    }
  );

  res.status(statusCode).json({
    success: false,
    message,
    // Include stack trace only in development for debugging
    ...(manualConfig.env === "development" && { stack: err.stack }),
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
  });
};
