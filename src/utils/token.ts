import { config } from "../config/config";
import jwt, { JwtPayload, SignOptions } from "jsonwebtoken";

interface TokenPayload {
  role?: "user" | "admin";
  id: string;
  email?: string;
  [key: string]: any;
}

const accessSecret = config.jwt.secret as string;
const accessExpiry = config.jwt.expiresIn as SignOptions["expiresIn"];

export const generateAccessToken = (
  payload: TokenPayload,
  options: SignOptions = {}
): string => {
  return jwt.sign(payload, accessSecret, {
    expiresIn: accessExpiry || "15m",
    ...options,
  });
};

export const verifyAccessToken = (token: string): TokenPayload => {
  try {
    return jwt.verify(token, accessSecret) as TokenPayload;
  } catch (err: any) {
    throw new Error(`Invalid access token: ${err.message}`);
  }
};

export const decodeToken = (token: string): JwtPayload | null => {
  try {
    return jwt.decode(token) as JwtPayload;
  } catch {
    return null;
  }
};
