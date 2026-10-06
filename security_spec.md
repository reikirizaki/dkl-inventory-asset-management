# Security Specification: DKL Inventory & Asset Management

## 1. System Invariants & RBAC Architecture
- **Roles**: `ADMIN`, `USER`, `AUDITOR`.
- **Closed Registration**: Public users cannot sign up or create user documents. Accounts are created and activated strictly by `ADMIN`.
- **Bootstrapped Admin**: `ReiKirizaki@gmail.com` is granted administrative access.
- **Auditor Role**: Strictly read-only across all operational collections (`assets`, `inventory_items`, `inventory_transactions`, `asset_transfers`, `stock_opname`, `maintenance`, `repairs`, `audit_logs`).
- **Audit Immutability**: `audit_logs` and `asset_history` documents are append-only. No user (even ADMIN) can update or delete existing audit log entries.
- **Branch Enforcement**: Operations for `SINGARAJA` or `TEJAKULA` validate user's assigned branch or allow `ALL` for designated administrators.
- **Company Settings**: Read-accessible by authenticated staff; write restricted strictly to `ADMIN`.

## 2. The Dirty Dozen Security Test Scenarios
1. **Unauthenticated Public Read**: Anonymous user attempts to read `/assets` or `/users` -> REJECTED.
2. **Public Self-Registration**: Unauthenticated or unauthorized user attempts `setDoc` to `/users/{uid}` with `role: "ADMIN"` -> REJECTED.
3. **Privilege Escalation**: Standard `USER` attempts to update `/users/{uid}` with `role: "ADMIN"` -> REJECTED.
4. **Audit Log Tampering**: User attempts to update or delete an `/audit_logs/{logId}` record -> REJECTED.
5. **Auditor Write Violation**: User with `role: "AUDITOR"` attempts to create or update an asset in `/assets` -> REJECTED.
6. **Inactive Account Write**: User with `isActive: false` attempts to write an asset -> REJECTED.
7. **Identity Spoofing**: User A creates an asset with `createdBy: "user_B"` -> REJECTED.
8. **Negative Stock Insertion**: Malicious client attempts to insert negative quantity or inventory manipulation -> REJECTED.
9. **Arbitrary Field Injection (Shadow Update)**: User injects unexpected fields into master data -> REJECTED.
10. **Branch Tampering**: User assigned to `SINGARAJA` attempts to modify records for `TEJAKULA` without permissions -> REJECTED.
11. **Settings Tampering by User**: User with role `USER` attempts to update company branding or logo in `/company_settings/main` -> REJECTED.
12. **Asset History Deletion**: User attempts to erase past transfer or repair history -> REJECTED.
