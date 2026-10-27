# 💳 Wallet Service & Double-Entry Ledger Backend

A robust, enterprise-grade **Digital Wallet and Double-Entry Audit Ledger System** built with **Node.js, Express, TypeScript, and MongoDB**. Designed to handle high-concurrency financial operations with zero-sum balanced ledgers, atomic balance deduction, idempotent requests, and strict integer-based paise arithmetic.

---

## 🌟 Key Features

### 👤 User Capabilities
- **Authentication**: JWT-based secure signup & login with bcrypt password hashing.
- **Wallet Balance**: Real-time view of `wallet` (total), `lockedBalance` (reserved), and `availableBalance` (`wallet - lockedBalance`).
- **Simulated Deposit**: Instant simulated top-up creating balanced user and clearing ledger entries.
- **Peer-to-Peer Transfer**: Transfer money to any user via `username`, `email`, or `_id`.
  - **Dynamic Fee**: 1% fee (minimum ₹1, maximum ₹20) paid by sender.
  - **Daily Limits**: Maximum ₹25,000 per transfer, maximum ₹50,000 per user per day.
- **Withdrawal Requests**: Reserve money into `lockedBalance` for bank payout without immediate debit.
- **Transaction History**: Paginated, filterable transaction statements.

### 🛡️ Admin & Governance
- **Pending Withdrawals Queue**: Admin dashboard view of pending withdrawal requests.
- **Approve / Reject Withdrawals**:
  - **Approve**: Finalizes bank transfer, clears `lockedBalance`, debits `wallet`, and writes `USER` + `BANK` ledger entries.
  - **Reject**: Releases reserved funds back to user's `availableBalance` with audit reason.
- **Transfer Reversals**: Reverses completed transfers atomically, clowing back recipient funds, refunding the sender (amount + fee), and writing compensating zero-sum audit entries while preserving full transaction lineage (`relatedTransactionId`).
- **Append-Only Double-Entry Ledger**: Immutable audit log verifying debits and credits always balance to zero ($\sum = 0$).

---

## 💰 Core Financial Rules

1. **Paise Precision (Integer Arithmetic)**:
   - Money is strictly stored and calculated in whole **paise** (1 Rupee = 100 paise).
   - Floating-point calculations (`0.1 + 0.2 = 0.30000000000000004`) are strictly prohibited in business logic to prevent rounding drift.
2. **Double-Entry Ledger Balancing**:
   - Every financial event generates balanced ledger records across accounts (`USER`, `FEE`, `CLEARING`, `BANK`).
   - The ledger service asserts: $\sum \text{amounts} = 0$. If any batch does not sum to zero, it is rejected before database write.
3. **Immutable Audit Trail**:
   - Ledger entries cannot be updated or deleted once written (`pre` hooks throw errors on update/delete operations).
4. **No Negative Balances**:
   - Atomic conditional queries (`$expr: { $gte: [{ $subtract: ["$wallet", "$lockedBalance"] }, amount] }`) guarantee balances never go negative, even under 50+ concurrent requests.
5. **Strict Idempotency**:
   - Client sends `x-idempotency-key` header.
   - Duplicate replays return HTTP `200 OK` with existing transaction.
   - Reusing the same key with different parameters immediately raises `HTTP 409 Conflict`.

---

## 📁 Project Architecture & Directory Structure

```text
Assignment/
├── .env.development.example        # Sample environment variables (local MongoDB)
├── .env                            # Active environment variables
├── .gitignore                      # Git ignored files & directories
├── package.json                    # Project dependencies and npm scripts
├── tsconfig.json                   # TypeScript compiler configuration
├── postman_collection.json         # Complete Postman testing collection
├── DECISIONS.md                    # Architecture decisions, assumptions & AI critique
├── README.md                       # Comprehensive setup and API documentation
└── src/
    ├── server.ts                   # Application bootstrapper and DB connection
    ├── app.ts                      # Express app setup, middlewares, and routes
    ├── config/                     # Configuration modules
    │   ├── config.ts               # Type-safe environment config
    │   ├── database.ts             # Mongoose MongoDB connection
    │   └── logger.ts               # Winston structured logging
    ├── middlewares/                # Express middlewares
    │   ├── authMiddleware.ts       # JWT authentication & role-based access control
    │   ├── corsMiddleware.ts       # Dynamic CORS handling (supports '*' wildcard)
    │   ├── errorHandler.ts         # Centralized error handling
    │   ├── limiter.ts              # IP-based rate limiting
    │   └── notFounHandler.ts       # 404 handler
    ├── modals/                     # Mongoose Schema Definitions
    │   ├── user.model.ts           # User accounts and wallet balances
    │   ├── transaction.model.ts    # High-level transactions & idempotency keys
    │   └── ledger.model.ts         # Append-only double-entry ledger entries
    ├── services/                   # Core business services
    │   ├── common.services.ts      # Generic paginated CRUD service
    │   └── ledger.service.ts       # Balanced double-entry ledger generator
    ├── public/                     # Feature modules
    │   ├── user/                   # User authentication & profiles
    │   │   ├── user.controller.ts
    │   │   ├── user.routes.ts
    │   │   ├── user.service.ts
    │   │   └── user.validation.ts
    │   └── wallet/                 # Wallet operations & admin governance
    │       ├── wallet.controller.ts
    │       ├── wallet.routes.ts
    │       ├── wallet.service.ts
    │       └── wallet.validation.ts
    └── utils/                      # Utilities
        ├── ApiError.ts             # Standardized operational error class
        ├── ApiResponse.ts          # Consistent JSON response wrapper
        ├── asyncHandler.ts         # Async route wrapper
        ├── token.ts                # JWT creation and verification
        └── validate.ts             # Zod schema validation helper
```

---

## 🗄️ Database Schemas

### 1. User Model (`users`)
```typescript
{
  name: string;
  username: string;          // Unique, indexed
  email: string;             // Unique, indexed
  password: string;          // Bcrypt hashed (salt 10)
  phone?: string;
  role: "user" | "admin";    // Default: "user"
  wallet: number;            // Total funds in paise (default: 0)
  lockedBalance: number;     // Reserved funds in paise (default: 0)
  availableBalance: number;  // Virtual: wallet - lockedBalance
  status: boolean;           // Default: true
}
```

### 2. Transaction Model (`transactions`)
```typescript
{
  userId: ObjectId;                 // Initiator or account owner
  recipientId?: ObjectId;           // Target user for transfers
  type: "DEPOSIT" | "TRANSFER" | "WITHDRAWAL" | "REVERSAL";
  status: "PENDING" | "COMPLETED" | "REJECTED" | "REVERSED";
  amount: number;                   // Whole paise
  fee: number;                      // Platform fee in paise
  idempotencyKey?: string;          // Unique sparse index
  relatedTransactionId?: ObjectId;  // Links reversal to original transfer
  description?: string;
  bankDetails?: {
    accountNumber: string;
    ifscCode: string;
    accountHolderName: string;
    bankName: string;
  };
  rejectionReason?: string;
  reversalReason?: string;
}
```

### 3. Ledger Entry Model (`ledgerentries`)
```typescript
{
  transactionId: ObjectId;          // Reference to transaction
  userId?: ObjectId;                // Associated user
  account: "USER" | "FEE" | "CLEARING" | "BANK";
  amount: number;                   // Signed paise: +credit, -debit
  description: string;
  createdAt: Date;
}
```
*Note: Mongoose pre-hooks block `updateOne`, `updateMany`, `deleteOne`, and `deleteMany` to enforce immutability.*

---

## ⚙️ Installation & Setup

### Prerequisites
- [Node.js](https://nodejs.org/) (v18.x or v20.x recommended)
- [MongoDB](https://www.mongodb.com/) (Local instance running at `mongodb://localhost:27017` or MongoDB Atlas URI)

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/iamarpitsharma/assignment-bloom.git
cd assignment-bloom
npm install
```

### 2. Configure Environment Variables
Create `.env` in the root directory by copying `.env.development.example`:
```bash
cp .env.development.example .env
```

Edit `.env` with your settings:
```env
# =================== ENVIRONMENT SETTINGS ===================
NODE_ENV=development
PORT=5018
APP_BASE_URL=http://localhost:5018
FRONTEND_URL=http://localhost:3000

# =================== CORS CONFIGURATION ======================
ALLOWED_ORIGINS=*
CORS_ENABLED=true

# =================== DATABASE CONFIG =========================
DB_NAME=bloom_assignment
DB_URL=mongodb://localhost:27017     # Or your MongoDB Atlas connection string

# =================== AUTH & JWT CONFIG =======================
JWT_SECRET=super_secret_jwt_key_at_least_32_characters_long
JWT_EXPIRES_IN=7d

# =================== SECURITY SETTINGS ======================
RATE_LIMIT_ENABLED=true
RATE_LIMIT_MAX=500
RATE_LIMIT_WINDOW_MS=60000
BLOCKED_IPS=127.0.0.12
```

### 3. Run the Application

#### Development Mode (with hot-reload):
```bash
npm run dev
```

#### Production Build & Run:
```bash
npm run build
npm start
```
The server will boot and display ASCII banner on `http://localhost:5018`.

---

## 🚀 Deployment (Render / Cloud)

This project is fully production-ready for **Render**, **Railway**, or **AWS**:

1. **Build Command**: `npm install && npm run build`
2. **Start Command**: `npm start` *(runs `node dist/server.js`)*
3. **Port Binding**: Automatically binds to `process.env.PORT` provided by the cloud host.
4. **CORS**: Set `ALLOWED_ORIGINS=*` in the cloud environment dashboard to allow testing from any client/browser without IP restrictions.

---

## 🧪 Testing with Postman

A comprehensive, ready-to-test Postman collection is included in [`postman_collection.json`](./postman_collection.json):

1. Open Postman $\rightarrow$ Click **Import** $\rightarrow$ Select `postman_collection.json`.
2. The collection has pre-configured variables:
   - `baseUrl`: `http://localhost:5018` (or your Render URL)
   - `userToken`: Automatically captured on user login
   - `adminToken`: Automatically captured on admin login
   - `transactionId`, `transferId`, `withdrawalId`: Captured automatically in test scripts
3. Execute the requests in sequence:
   - **01. Authentication**: Register users (Arpit, Rahul, Aditya) & Admin (Aman).
   - **02. User Wallet Operations**:
     - Check Balance
     - Deposit ₹1,000 (100,000 paise)
     - Transfer ₹100 to Rahul (₹100 sent + ₹1 fee)
     - Transfer ₹250 to Aditya (₹250 sent + ₹2.50 fee)
     - Request Withdrawal of ₹200 (funds locked)
     - View Transaction History
   - **03. Admin Wallet & Governance**:
     - View Pending Withdrawals
     - Approve / Reject Withdrawal
     - Reverse Transfer (funds clawed back, sender refunded)
     - Audit Zero-Sum Append-Only Ledger

---

## 🛡️ Security & Reliability Highlights

- **Atomic Concurrency Guarantee**: Prevents double-spend and negative balances without relying purely on high-latency locks.
- **Rate Limiting**: Protects financial endpoints from brute-force and DDoS attacks.
- **Idempotency Conflict Rejection**: Replaying the same key with altered payload returns `409 Conflict`.
- **Zero-Sum Ledger Invariant**: Financial ledger maintains absolute mathematical integrity ($\sum = 0$).
