# 📐 Architecture & Implementation Decisions (DECISIONS.md)

This document provides a detailed breakdown of architectural decisions, assumptions, known limitations, and critiques of AI-generated suggestions made during the development of the **Wallet Service & Double-Entry Ledger System**.

---

## 1. Important Implementation Decisions

### 1.1 Integer Paise vs Floating-Point Numbers
- **Decision**: Store and calculate all monetary amounts exclusively as whole integers in **paise** (1 Rupee = 100 paise).
- **Rationale**: The IEEE 754 floating-point standard used by JavaScript (`number`) cannot accurately represent decimal fractions. For example, `0.1 + 0.2 = 0.30000000000000004`. Over thousands of transactions, floating-point rounding errors cause financial leakage and ledger reconciliation failures.
- **Enforcement**:
  - Mongoose models enforce `{ type: Number, set: (v: number) => Math.floor(v) }`.
  - All fees are calculated with `Math.round((amount * 1) / 100)`.
  - Formatting into Rupees (`₹X.XX`) is purely a view-layer transformation (`toRupees(paise)`).

### 1.2 Append-Only Double-Entry Audit Ledger
- **Decision**: Decouple high-level transactions (`Transaction` model) from granular financial movements (`LedgerEntry` model).
- **Rationale**: Updating a user's `wallet` field alone makes forensic auditing impossible if numbers diverge. Every financial movement generates corresponding debit and credit records across accounts (`USER`, `FEE`, `CLEARING`, `BANK`).
- **Mathematical Invariant**:
  $$\sum \text{LedgerEntry.amount} = 0$$
  `LedgerService.record()` verifies that the sum of signed integers in every transaction batch strictly equals zero before persisting to the database. If any batch fails this assertion, the operation is aborted.
- **Immutability Guarantee**: Mongoose `pre-save` and `pre-update/delete` hooks throw errors on any attempt to mutate or delete existing ledger documents.

### 1.3 Concurrency Control & Atomic Deductions
- **Decision**: Use MongoDB atomic conditional updates (`findOneAndUpdate` with `$expr`) rather than optimistic document versioning (`__v`) or application-level locks.
- **Rationale**: In high-concurrency environments (e.g. 50 parallel requests), optimistic locking causes 49 requests to fail with version conflicts and retry storms. By using atomic database-level operations:
  ```typescript
  await User.findOneAndUpdate(
    {
      _id: userId,
      $expr: { $gte: [{ $subtract: ["$wallet", "$lockedBalance"] }, totalDebit] }
    },
    { $inc: { wallet: -totalDebit } },
    { new: true }
  );
  ```
  MongoDB's row-level document lock handles atomic subtraction. Only requests with sufficient available balance succeed; all others immediately fail with `400 Insufficient balance`, without any risk of balance going negative or double-spending.

### 1.4 Funds Reservation Mechanism (`lockedBalance`)
- **Decision**: Introduce a `lockedBalance` field alongside `wallet`, and derive `availableBalance` via a virtual getter.
- **Rationale**: When a user requests a withdrawal of ₹200:
  - If money is deducted immediately and the admin rejects the withdrawal, refunding requires reversing deductions.
  - If money is not deducted, the user could transfer the funds to another user before admin approval, leading to double-spend.
  - By reserving the funds (`$inc: { lockedBalance: +amount }`), `availableBalance` decreases immediately, preventing other spending while keeping total wallet equity intact until administrative approval.

### 1.5 Transfer Reversal Strategy
- **Decision**: Preserve original transaction history and create an explicit, compensating `REVERSAL` transaction.
- **Rationale**: Never delete or overwrite the original transfer transaction. The original transfer status is updated to `REVERSED`, and a new `REVERSAL` transaction is created with `relatedTransactionId` pointing to the original ID. Compensating ledger entries are written:
  - Recipient debited: `-amount`
  - Sender refunded: `+amount`
  - Platform fee refunded: `+fee` (debited from `FEE` account: `-fee`)
  - Ledger sum: $(-amount) + (+amount) + (+fee) + (-fee) = 0$.

### 1.6 Strict Idempotency Handling
- **Decision**: Support `x-idempotency-key` with parameter conflict validation.
- **Rationale**: Network retries in payment systems can duplicate requests.
  - If a request is received with an existing key and **identical parameters**: Return `200 OK` with the existing transaction and `isDuplicate: true`.
  - If a request is received with an existing key but **different parameters** (e.g. changed amount): Throw `409 Conflict` to prevent silent payload mismatches.

---

## 2. Assumptions

1. **Single Currency**: All operations assume Indian Rupees (INR) denominated in paise.
2. **Instant Simulated Deposit**: Deposits are simulated payments assuming instantaneous clearance from an external payment gateway.
3. **Daily Limit Window**: The daily transfer limit of ₹50,000 per user resets at UTC `00:00:00`.
4. **Fee Refund Policy**: When an admin reverses a transfer, the platform refunds the 1% fee back to the sender, restoring the sender to their exact pre-transaction balance.
5. **Admin Authority**: Only authenticated users with `role: "admin"` are permitted to approve withdrawals, reject withdrawals, or execute transfer reversals.

---

## 3. Known Limitations & Production Enhancements

1. **Recipient Balance Clawback Risk**:
   - *Limitation*: When reversing a transfer, if the recipient has already withdrawn or transferred out their funds, their available balance might be insufficient to claw back.
   - *Current Behavior*: The system safely aborts the reversal with `400 Recipient has insufficient balance to claw back`, preventing the recipient's balance from dropping below zero.
   - *Production Solution*: Implement a negative escrow or debt ledger tracking uncollectible clawbacks with dispute management.
2. **Distributed Transactions across Multi-Sharded Clusters**:
   - *Limitation*: Mongoose session transactions across multi-region sharded MongoDB clusters incur network consensus latency.
   - *Production Solution*: For ultra-high scale (10,000+ TPS), transition to an event-driven Saga pattern utilizing Apache Kafka with an outbox table.
3. **External Banking Integration**:
   - *Limitation*: Withdrawal payouts to bank accounts are simulated by admin approval.
   - *Production Solution*: Integrate direct IMPS/NEFT/UPI webhook callbacks (e.g. RazorpayX or Cashfree Payouts) with asynchronous webhook signature verification.

---

## 4. AI-Generated Suggestions Rejected or Corrected

During development, several AI-generated patterns and suggestions were evaluated, rejected, or corrected to maintain engineering rigor:

### ❌ Critique 1: Rejected Complex Nested Ledger Inside Transaction Documents
- **AI Suggestion**: Embed ledger entries directly inside each `Transaction` document as an array of subdocuments.
- **Why Rejected**: Embedding ledger entries inside transactions violates double-entry principles. A single financial movement can span multiple entities (e.g. sender, recipient, platform fee account, clearing bank). Embedding ledger records in transactions creates document size bloat and prevents querying the global audit ledger as a single linear stream.
- **Solution Adopted**: Designed a standalone, flat `LedgerEntry` collection that acts as an independent, append-only double-entry ledger.

### ❌ Critique 2: Corrected Silent Idempotency Collision on Payload Changes
- **AI Suggestion**: The initial AI code checked `if (existing) return existing;` without validating whether the incoming request body matched the existing transaction.
- **Why Corrected**: When testing withdrawal flows, changing the withdrawal amount from ₹200 to ₹300 while Postman sent the same `x-idempotency-key` header caused the server to silently return the old completed ₹200 transaction! The client thought a ₹300 withdrawal was submitted, while the database had no record of it.
- **Solution Adopted**: Implemented strict parameter conflict validation. If `existing.amount !== amount`, the server raises `409 Conflict`. If parameters match, it returns `200 OK` with an explicit `"Existing transaction returned (idempotent replay)"` message.

### ❌ Critique 3: Corrected Production Start Script for Cloud Environments
- **AI Suggestion**: Left `"start": "nodemon src/server.ts"` in `package.json`.
- **Why Corrected**: Production hosts (like Render or Docker containers) do not install `devDependencies` when `NODE_ENV=production`, causing `nodemon` and `ts-node` to fail on container boot.
- **Solution Adopted**: Configured `"build": "tsc"` and `"start": "node dist/server.js"` to run the compiled, optimized JavaScript bundle in production.

### ❌ Critique 4: Enforced Explicit Return Statements in Controllers
- **AI Suggestion**: Controllers ended with `res.status(...).json(...)` without an explicit `return` keyword.
- **Why Corrected**: Without `return`, if any subsequent middleware or error handler is chained or if logic continues, Express can throw `ERR_HTTP_HEADERS_SENT` ("Cannot set headers after they are sent to the client").
- **Solution Adopted**: Refactored all controller methods to consistently use `return res.status(...).json(...)`.
