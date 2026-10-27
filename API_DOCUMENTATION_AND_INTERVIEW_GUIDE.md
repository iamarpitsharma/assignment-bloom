# 💼 Wallet Service Architecture, API Documentation & Interview Guide

This guide is designed to help you thoroughly understand every endpoint, how money moves under the hood, and how to confidently explain the entire architecture to an interviewer.

---

## 📌 1. High-Level Architecture & Design Principles

The service is built around **Fintech-grade engineering principles**:
1. **Whole Paise Arithmetic (Integers Only)**: All monetary values are represented in whole paise ($1\text{ INR} = 100\text{ paise}$). Never use floating-point numbers in financial calculations to avoid binary rounding drift (e.g. `0.1 + 0.2 !== 0.3`).
2. **Double-Entry Append-Only Ledger**: Money is never created or destroyed out of thin air. Every transaction writes balanced debit and credit entries such that the sum of ledger amounts is **always zero** ($\sum \text{amounts} = 0$). Ledger entries can **never** be edited or deleted.
3. **Atomic Concurrency Control**: Race conditions are prevented at the database storage engine layer using atomic conditional updates (`$expr: { $gte: [...] }`), ensuring parallel requests can never overdraft a wallet.
4. **Zero-Trust Role-Based Access Control**: Strict separation between regular users and administrators. Users can only touch their own funds; only administrators can approve/reject withdrawals and execute reversals.
5. **Idempotency Guarantee**: Unique `idempotencyKey` prevents duplicate execution when network requests are retried.

---

## 🚀 2. Complete API Reference & Internal Execution Flows

### 🔐 Part A: Authentication & User Management (`/api/user`)

#### 1. Register User / Admin
- **Route**: `POST /api/user/register`
- **Access**: Public
- **Request Body**:
  ```json
  {
    "name": "Arpit Sharma",
    "username": "arpit_sharma",
    "email": "arpit@example.com",
    "password": "password123",
    "phone": "+919876543210",
    "role": "user" // or "admin"
  }
  ```
- **How the Flow Goes**:
  1. Zod schema validates all inputs, lowercases and trims `username` and `email`, and sanitizes `role` to either `"user"` or `"admin"`.
  2. Queries MongoDB to ensure neither `email` nor `username` is already taken.
  3. Mongoose pre-save hook securely hashes the password with `bcrypt` (salt rounds: 10).
  4. Saves the user with `wallet: 0` and `lockedBalance: 0`.
  5. Generates a signed JWT access token and returns sanitized user data.

#### 2. Login User / Admin
- **Route**: `POST /api/user/login`
- **Access**: Public
- **Request Body**:
  ```json
  {
    "username": "arpit_sharma", // or "email": "arpit@example.com"
    "password": "password123"
  }
  ```
- **How the Flow Goes**:
  1. Accepts either `username` or `email` as the login identifier.
  2. Looks up the user in MongoDB.
  3. Checks if `user.status` is active (`true`).
  4. Calls `user.comparePassword(password)` using bcrypt.
  5. Issues a JWT containing `id`, `email`, and `role`.

#### 3. Get Current User Profile
- **Route**: `GET /api/user/me`
- **Access**: Authenticated User (`Bearer <TOKEN>`)
- **How the Flow Goes**:
  1. `authenticateToken` middleware verifies JWT and injects `req.user`.
  2. Finds user by `req.user.id`, excluding password field (`-password`).
  3. Returns user profile including balances.

#### 4. List Users (Paginated)
- **Route**: `GET /api/user?page=1&limit=10&search=arpit`
- **Access**: Authenticated User / Admin
- **How the Flow Goes**:
  1. Delegates to `CommonService.getAll(req.query)`.
  2. Builds an aggregation pipeline with sorting, regex search, and `$facet` pagination.
  3. Returns `result` items and `pagination` metadata (`currentPage`, `totalPages`, `totalItems`).

---

### 💳 Part B: User Wallet Operations (`/api/wallet`)

#### 1. View Wallet Balance
- **Route**: `GET /api/wallet/balance`
- **Access**: Authenticated User
- **Response**:
  ```json
  {
    "statusCode": 200,
    "success": true,
    "message": "Balance fetched successfully",
    "data": {
      "wallet": 100000,
      "lockedBalance": 20000,
      "availableBalance": 80000,
      "walletInRupees": "1000.00",
      "lockedInRupees": "200.00",
      "availableInRupees": "800.00"
    }
  }
  ```
- **How the Flow Goes**:
  1. Fetches user from DB.
  2. Computes `availableBalance = Math.max(0, wallet - lockedBalance)`.
  3. Returns both raw whole paise integers and clean two-decimal rupee strings.

---

#### 2. Deposit Money (Simulated Payment Flow)
- **Route**: `POST /api/wallet/deposit`
- **Access**: Authenticated User
- **Request Body**:
  ```json
  {
    "amount": 100000, // ₹1,000 in paise
    "paymentReference": "SIM-TXN-1001"
  }
  ```
  *(Optional header: `x-idempotency-key: dep-arpit-001`)*
- **How the Flow Goes**:
  1. **Idempotency Check**: If an `idempotencyKey` is provided, queries if a completed deposit with that key already exists. If found, returns the existing record immediately (prevents duplicate credit if request was retried).
  2. **Balance Credit**: Atomically increments `wallet` by `amount`:
     ```typescript
     await User.findByIdAndUpdate(userId, { $inc: { wallet: amount } });
     ```
  3. **Transaction Record**: Creates a `Transaction` document with `type: "DEPOSIT"` and `status: "COMPLETED"`.
  4. **Balanced Ledger Recording**: Writes two balanced entries:
     - `USER` wallet credited: `+100000`
     - `CLEARING` account debited: `-100000`
     - **Net Sum**: $+100,000 + (-100,000) = 0$.

---

#### 3. Transfer Money to Another User
- **Route**: `POST /api/wallet/transfer`
- **Access**: Authenticated User
- **Request Body**:
  ```json
  {
    "recipient": "rahul_jha", // username, email, or user ID
    "amount": 10000,          // ₹100 in paise
    "description": "Payment to Rahul for project review"
  }
  ```
  *(Optional header: `x-idempotency-key: transfer-arpit-rahul-001`)*
- **How the Flow Goes**:
  1. **Idempotency Check**: Verifies key has not been processed.
  2. **Daily Limit Check**: Aggregates the sum of all completed transfers made by this user since `00:00:00 UTC` of the current day. If $\text{transferredToday} + \text{amount} > 5,000,000\text{ paise}$ (₹50,000), throws `400 Bad Request`.
  3. **Recipient Resolution**: Finds recipient by `_id`, `username`, or `email`. Validates that recipient exists, is active, and is not the sender themselves.
  4. **Fee Calculation**:
     $$\text{fee} = \min(2000, \max(100, \lfloor \text{amount} \times 0.01 \rfloor))$$
     For ₹100 (10,000 paise), 1% is 100 paise (₹1).
     $$\text{totalDebit} = \text{amount} + \text{fee} = 10,000 + 100 = 10,100\text{ paise}$$
  5. **Atomic Concurrency-Safe Deduction**:
     ```typescript
     const sender = await User.findOneAndUpdate(
       {
         _id: senderId,
         $expr: {
           $gte: [{ $subtract: ["$wallet", "$lockedBalance"] }, totalDebit],
         },
       },
       { $inc: { wallet: -totalDebit } },
       { new: true }
     );
     ```
     If sender's available balance is insufficient, MongoDB updates nothing and returns `null`. The code throws `400 Insufficient available balance`.
  6. **Recipient Credit**: Atomically credits recipient:
     ```typescript
     await User.findByIdAndUpdate(recipient._id, { $inc: { wallet: amount } });
     ```
  7. **Transaction Creation**: Saves a `TRANSFER` transaction with `amount: 10000`, `fee: 100`.
  8. **Balanced Append-Only Ledger Entry**:
     - Sender `USER` wallet: `-10100` (Debit)
     - Recipient `USER` wallet: `+10000` (Credit)
     - Platform `FEE` account: `+100` (Credit)
     - **Net Sum**: $-10,100 + 10,000 + 100 = 0$.

---

#### 4. Request a Withdrawal
- **Route**: `POST /api/wallet/withdraw`
- **Access**: Authenticated User
- **Request Body**:
  ```json
  {
    "amount": 20000, // ₹200 in paise
    "bankDetails": {
      "accountNumber": "123456789012",
      "ifscCode": "HDFC0001234",
      "accountHolderName": "Arpit Sharma",
      "bankName": "HDFC Bank"
    }
  }
  ```
- **How the Flow Goes**:
  1. **Atomic Fund Reservation**:
     ```typescript
     const user = await User.findOneAndUpdate(
       {
         _id: userId,
         $expr: {
           $gte: [{ $subtract: ["$wallet", "$lockedBalance"] }, amount],
         },
       },
       { $inc: { lockedBalance: amount } },
       { new: true }
     );
     ```
     The amount is added to `lockedBalance`.
  2. Because `availableBalance = wallet - lockedBalance`, **the reserved ₹200 cannot be spent on transfers or other withdrawals** while pending!
  3. Creates a `WITHDRAWAL` transaction with `status: "PENDING"`.
  4. No external ledger entry is recorded yet because money has not left the platform.

#### 5. View My Transactions
- **Route**: `GET /api/wallet/transactions?page=1&limit=10&sortDir=desc`
- **Access**: Authenticated User
- **How the Flow Goes**:
  - Automatically filters by `userId: req.user.id` so users can **only** see their own transactions.
  - Returns paginated history via `CommonService`.

---

### 🛡️ Part C: Admin Governance & Controls (`/api/wallet/admin`)

#### 1. View Pending Withdrawals
- **Route**: `GET /api/wallet/admin/pending-withdrawals?page=1&limit=10`
- **Access**: Admin Role Only (`isAdmin` middleware)
- **How the Flow Goes**:
  - Queries `Transaction` where `type: "WITHDRAWAL"` and `status: "PENDING"`.
  - Paginated with `CommonService`.

---

#### 2. Approve Withdrawal Request
- **Route**: `POST /api/wallet/admin/withdrawals/:id/approve`
- **Access**: Admin Role Only
- **How the Flow Goes**:
  1. **Atomic State Transition**:
     ```typescript
     const txn = await Transaction.findOneAndUpdate(
       { _id: id, type: "WITHDRAWAL", status: "PENDING" },
       { status: "COMPLETED" },
       { new: true }
     );
     ```
     If the admin clicks "Approve" 5 times concurrently, **only the first request matches `status: "PENDING"`**. The other 4 return `null` and fail cleanly (preventing duplicate disbursement).
  2. **Deducts Funds**:
     ```typescript
     await User.findByIdAndUpdate(txn.userId, {
       $inc: { wallet: -txn.amount, lockedBalance: -txn.amount },
     });
     ```
  3. **Balanced Ledger Recording**:
     - User wallet: `-txn.amount` (Debit)
     - Bank payout: `+txn.amount` (Credit)
     - **Net Sum**: $-20,000 + 20,000 = 0$.

---

#### 3. Reject Withdrawal Request
- **Route**: `POST /api/wallet/admin/withdrawals/:id/reject`
- **Access**: Admin Role Only
- **Request Body**:
  ```json
  {
    "reason": "Bank account number and IFSC code mismatch"
  }
  ```
- **How the Flow Goes**:
  1. Atomically transitions transaction from `status: "PENDING"` to `status: "REJECTED"`.
  2. **Releases Locked Funds**:
     ```typescript
     await User.findByIdAndUpdate(txn.userId, {
       $inc: { lockedBalance: -txn.amount },
     });
     ```
     The user's available balance is immediately restored.

---

#### 4. Reverse a Completed Transfer
- **Route**: `POST /api/wallet/admin/transfers/:id/reverse`
- **Access**: Admin Role Only
- **Request Body**:
  ```json
  {
    "reason": "Disputed transaction: accidental duplicate payment to Rahul"
  }
  ```
- **How the Flow Goes**:
  1. **Atomic Status Check**:
     ```typescript
     const originalTxn = await Transaction.findOneAndUpdate(
       { _id: id, type: "TRANSFER", status: "COMPLETED" },
       { status: "REVERSED" },
       { new: true }
     );
     ```
     Guarantees a transfer cannot be reversed twice.
  2. **Recipient Balance Check & Clawback**:
     Verifies the recipient actually has enough available balance to be clawed back:
     ```typescript
     const recipient = await User.findOneAndUpdate(
       {
         _id: originalTxn.recipientId,
         $expr: { $gte: [{ $subtract: ["$wallet", "$lockedBalance"] }, originalTxn.amount] },
       },
       { $inc: { wallet: -originalTxn.amount } },
       { new: true }
     );
     ```
     If recipient does not have enough balance, the status is reverted and the operation fails safely.
  3. **Refund Sender**:
     Sender is refunded the full debited amount ($\text{amount} + \text{fee}$):
     ```typescript
     await User.findByIdAndUpdate(originalTxn.userId, {
       $inc: { wallet: originalTxn.amount + originalTxn.fee },
     });
     ```
  4. **Linked Reversal Transaction**:
     Creates a new `REVERSAL` transaction document referencing `relatedTransactionId: originalTxn._id`.
  5. **Compensating Balanced Ledger**:
     - Sender `USER` wallet: `+(amount + fee)` (Credit refund)
     - Recipient `USER` wallet: `-amount` (Debit clawback)
     - Platform `FEE` account: `-fee` (Debit fee refund)
     - **Net Sum**: $+(10,000 + 100) - 10,000 - 100 = 0$.
     The original transfer history and original ledger entries remain untouched and immutable!

---

#### 5. View Append-Only Audit Ledger
- **Route**: `GET /api/wallet/admin/ledger?page=1&limit=50`
- **Access**: Admin Role Only
- **How the Flow Goes**:
  - Exposes the raw, immutable double-entry ledger entries for platform auditors.
  - Allows verifying that total debits equal total credits across the system.

---

## 🎯 3. Top Interview Questions & How to Answer Them

### Q1: "Why did you store money in paise rather than rupees or floating-point numbers?"
> **Answer**:
> *"In JavaScript, numbers follow the IEEE 754 standard for floating-point arithmetic. If we store amounts as floats (e.g. `10.50`), operations like `0.1 + 0.2` yield `0.30000000000000004`, leading to fractional cent drift and severe financial discrepancies. By storing everything as whole integers in paise ($1\text{ INR} = 100\text{ paise}$), all math is pure integer arithmetic with zero rounding errors. We only convert to rupee strings at the boundary when returning responses to the user."*

---

### Q2: "Suppose a user has ₹1,000. 50 parallel requests of ₹100 each (with ₹1 fee) hit the server simultaneously. Exactly how does your code guarantee that only 9 succeed and the remaining balance is ₹91?"
> **Answer**:
> *"In a naive implementation, code reads the balance with `findById()`, checks `if (balance >= 101)`, and then saves. Under 50 concurrent threads, all 50 threads would read ₹1,000 simultaneously and overdraft the wallet.
> In our implementation, we use MongoDB's atomic conditional update:
> ```typescript
> User.findOneAndUpdate(
>   {
>     _id: senderId,
>     $expr: {
>       $gte: [{ $subtract: ["$wallet", "$lockedBalance"] }, totalDebit],
>     },
>   },
>   { $inc: { wallet: -totalDebit } }
> );
> ```
> Each transfer requires ₹100 + ₹1 fee = ₹101 (10,100 paise). The database engine executes this condition atomically on the document. 
> - 1st request debits ₹101 $\rightarrow$ balance ₹899
> - ...
> - 9th request debits ₹101 $\rightarrow$ balance ₹91
> - The 10th request evaluates whether `availableBalance >= 10100` (is $9100 \ge 10100$?). It evaluates to `false`. MongoDB updates zero documents and returns `null`.
> - Requests 10 through 50 fail with 'Insufficient available balance'.
> Exactly 9 succeed, and the remaining balance is exactly ₹91."*

---

### Q3: "What is an append-only balanced ledger, and why is it necessary?"
> **Answer**:
> *"In fintech systems, updating a user's balance column directly is not enough because you lose the audit trail of where money came from and where it went. An append-only ledger treats money movements like a real accounting journal.
> For every transaction, we record at least two entries that balance to zero:
> - In a deposit: User (+₹100) and Clearing (-₹100) = 0.
> - In a transfer: Sender (-₹101), Recipient (+₹100), Fee (+₹1) = 0.
> Our `LedgerService` enforces that the sum of amounts must equal zero before insertion. Furthermore, Mongoose pre-hooks on `updateOne`, `deleteMany`, etc., throw errors to guarantee that ledger entries are append-only and immutable."*

---

### Q4: "How do you prevent money reserved for a withdrawal from being spent on a transfer?"
> **Answer**:
> *"We separate total funds (`wallet`) from reserved funds (`lockedBalance`).
> When a user requests a withdrawal of ₹200, we atomically increment `lockedBalance` by 20,000 paise.
> Every outgoing transfer checks available balance, defined as `wallet - lockedBalance`. Even though the total wallet still shows ₹1,000, only ₹800 is available for transfers. When the admin approves the withdrawal, we deduct both `wallet` and `lockedBalance`. If rejected, we simply decrement `lockedBalance`, returning the funds to available."*

---

### Q5: "How does your system handle transfer reversals without corrupting history?"
> **Answer**:
> *"We follow the compensating transaction pattern. We never delete or edit the original transfer document or its ledger entries.
> 1. We atomically update the original transfer's status to `REVERSED`.
> 2. We verify the recipient still has enough available balance to be clawed back.
> 3. We create a new `REVERSAL` transaction linked to the original ID.
> 4. We record compensating ledger entries: sender credited +(amount + fee), recipient debited -amount, fee debited -fee (summing to zero).
> This provides an uncompromised audit trail for regulatory and compliance inspection."*

---

## 🧪 4. Quick Testing Walkthrough (Using Postman)

1. **Import `postman_collection.json`** into Postman.
2. Run **`01. Auth & Users -> 5. Login as Arpit Sharma`** (auto-stores `{{userToken}}`).
3. Run **`01. Auth & Users -> 6. Login as Aman Sharma (Admin)`** (auto-stores `{{adminToken}}`).
4. Run **`02. User Wallet Operations -> 2. Deposit Money`** (Deposits ₹1,000 into Arpit's wallet).
5. Run **`02. User Wallet Operations -> 3. Transfer Money to Rahul Jha`** (Transfers ₹100 + ₹1 fee).
6. Run **`02. User Wallet Operations -> 1. View Wallet Balance`** (Arpit now has ₹899 available).
7. Run **`02. User Wallet Operations -> 5. Request Withdrawal`** (Requests ₹200 withdrawal; available balance becomes ₹699).
8. Run **`03. Admin Wallet & Governance -> 2. Approve Withdrawal Request`** (Admin approves; ₹200 disburse).
9. Run **`03. Admin Wallet & Governance -> 4. Reverse Completed Transfer`** (Admin reverses the ₹100 transfer; Arpit is refunded ₹101 and Rahul is debited ₹100).
10. Run **`03. Admin Wallet & Governance -> 6. View Append-Only Audit Ledger`** (Inspect the zero-sum ledger entries).
