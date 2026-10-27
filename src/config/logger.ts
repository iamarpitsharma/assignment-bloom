import "colors";
import winston from "winston";

// 1. Define an interface for the log information properties.
interface LogEntryInfo {
  timestamp: string;
  level: string;
  message: string;
  [key: string]: any;
}

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp({
      format: () => {
        const now = new Date();
        return now.toLocaleString("en-US", {
          weekday: "short",
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "numeric",
          hour12: true,
        });
      },
    }),

    // 2. Use the two-step assertion to safely convert the type
    winston.format.printf((info) => {
      // FIX: Convert 'info' to 'unknown' first, and THEN to 'LogEntryInfo' 
      // to resolve the TS2352 non-overlap error.
      const logEntry = info as unknown as LogEntryInfo;

      const { timestamp, level, message } = logEntry;

      // Use the colored properties
      return `${timestamp.grey} ${level.yellow}: ${message}`;
    }),
  ),
  transports: [new winston.transports.Console()],
});

export { logger };