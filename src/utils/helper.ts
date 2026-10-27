import mongoose from "mongoose";
const { ObjectId } = mongoose.Types;

/**
 * Build the MongoDB aggregation pipeline based on query filters and pagination
 */
export const getPipeline = (
  query: Record<string, any> = {},
  additionalStages?: any[] | Record<string, any>
) => {
  const {
    page = 1,
    limit = 10,
    search = "",
    searchkey,
    sortDir = "desc",
    sortKey = "createdAt",
    startDate,
    endDate,
    ...restQuery
  } = query;

  const pageNumber = Math.max(parseInt(page, 10), 1);
  const limitNumber = Math.max(parseInt(limit, 10), 1);
  const basePipeline: any[] = [];
  const match: Record<string, any> = {};

  const safeObjectId = (val: any): mongoose.Types.ObjectId | any =>
    ObjectId.isValid(val) ? new ObjectId(val) : val;

  const convertToBoolean = (value: any) => {
    if (value === undefined || value === null) return undefined;
    const strValue = String(value).toLowerCase().trim();
    if (["true", "1", "yes"].includes(strValue)) return true;
    if (["false", "0", "no"].includes(strValue)) return false;
    return undefined;
  };

  // Dynamic filter matching for any provided field
  for (const [key, rawValue] of Object.entries(restQuery)) {
    if (rawValue === undefined || rawValue === null || rawValue === "") continue;

    // Check boolean-like values
    const boolVal = convertToBoolean(rawValue);
    if (boolVal !== undefined) {
      match[key] = boolVal;
      continue;
    }

    // Check ObjectId-like values (24 hex characters)
    if (
      typeof rawValue === "string" &&
      ObjectId.isValid(rawValue) &&
      /^[0-9a-fA-F]{24}$/.test(rawValue)
    ) {
      match[key] = safeObjectId(rawValue);
      continue;
    }

    // Numbers
    if (!isNaN(Number(rawValue)) && typeof rawValue !== "boolean") {
      match[key] = Number(rawValue);
      continue;
    }

    // Standard string matching
    match[key] = rawValue;
  }

  // Date range filter
  if (startDate || endDate) {
    match.createdAt = {};
    if (startDate) match.createdAt.$gte = new Date(startDate);
    if (endDate) match.createdAt.$lte = new Date(endDate);
  }

  if (Object.keys(match).length) {
    basePipeline.push({ $match: match });
  }

  // Additional pipeline stages (lookups, projections, etc.)
  if (Array.isArray(additionalStages)) {
    basePipeline.push(...additionalStages);
  } else if (additionalStages && typeof additionalStages === "object") {
    basePipeline.push(additionalStages);
  }

  // Search across specified key(s)
  if (search && searchkey) {
    const keys = String(searchkey)
      .split(",")
      .map((k: string) => k.trim())
      .filter(Boolean);

    if (keys.length > 1) {
      basePipeline.push({
        $match: {
          $or: keys.map((k: string) => ({
            [k]: { $regex: search, $options: "i" },
          })),
        },
      });
    } else if (keys.length === 1) {
      const key = keys[0];
      if (key === "_id") {
        basePipeline.push({ $addFields: { idStr: { $toString: "$_id" } } });
        basePipeline.push({
          $match: { idStr: { $regex: search, $options: "i" } },
        });
        basePipeline.push({ $project: { idStr: 0 } });
      } else {
        basePipeline.push({
          $match: { [key]: { $regex: search, $options: "i" } },
        });
      }
    }
  }

  // Sort and facet for pagination
  const pipeline = [
    ...basePipeline,
    { $sort: { [sortKey]: sortDir === "asc" ? 1 : -1 } },
    {
      $facet: {
        data: [
          { $skip: (pageNumber - 1) * limitNumber },
          { $limit: limitNumber },
        ],
        total: [{ $count: "count" }],
      },
    },
    {
      $addFields: {
        totalCount: { $ifNull: [{ $arrayElemAt: ["$total.count", 0] }, 0] },
      },
    },
  ];

  return {
    pipeline,
    matchStage: match,
    options: { collation: { locale: "en", strength: 2 }, allowDiskUse: true },
  };
};

/**
 * Format the result with pagination info
 */
export const paginationResult = (
  pageNumber: number,
  limitNumber: number,
  totalResults: number,
  results: any[]
) => {
  return {
    result: results,
    pagination: {
      currentPage: pageNumber,
      totalItems: totalResults,
      itemsPerPage: limitNumber,
      totalPages: Math.ceil(totalResults / limitNumber),
    },
  };
};

/**
 * Convert string to MongoDB ObjectId
 */
export const convertToObjectId = (id: string): mongoose.Types.ObjectId | null => {
  try {
    return new ObjectId(id);
  } catch (error) {
    return null;
  }
};

/**
 * Check if string is valid MongoDB ObjectId
 */
export const isValidObjectId = (id: string): boolean => {
  try {
    return ObjectId.isValid(id);
  } catch (error) {
    return false;
  }
};

/**
 * Check if string is valid email
 */
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
};

/**
 * Check if string is valid phone number
 */
export const isValidPhoneNumber = (phone: string): boolean => {
  const phoneRegex = /^\+?[1-9]\d{1,14}$/;
  return phoneRegex.test(phone);
};

