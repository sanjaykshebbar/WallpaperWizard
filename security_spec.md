# Security Specification: AdBoard V3

## 1. Data Invariants

1.  **Strict Authentication Checks**: Non-authenticated clients can only read the `config/init`, `settings/displayConfig`, and active `media/` documents. All data-mutation permissions (`create`, `update`, `delete`) and listing admin details are strictly reserved for verified, authenticated administrators registered in the `users` and verified in the database.
2.  **No Autonomous Self-Registration**: Users cannot self-register as `admin` unless the system is in First-Run Setup mode (where `config/init` indicates `setupCompleted: false`). If setup is complete, no user profiles can be created without admin credentials.
3.  **Media Integrity**: Any write to the `media` collection must pass size and MIME validation logic, enforce file-limit bounds, and verify that the `ownerId` exactly corresponds to the authenticated administrative client's UID.
4.  **Temporal Integrity**: Timestamps like `createdAt` and `updatedAt` inside media or configurations must be governed strictly by the server's time (`request.time`) instead of the client's localized device clock.
5.  **Immutability**: Crucial structural attributes such as the original `createdAt`, original media ID, and structural relationships cannot be updated or modified after initial creation.

---

## 2. The "Dirty Dozen" Payload Attack Set

The following twelve mock configurations must be strictly denied by the ruleset:

### Identity & Access Violations

1.  **Anonymous User Arbitrary Read**:
    *   **Action**: Attempt to `list` (query) all accounts inside `/users/` without authentication.
    *   **Rule Defense**: Blocked. Reads inside `/users/` are private.

2.  **Self-Assigned Admin Role Profile Creation**:
    *   **Action**: Sending a `create` request to `/users/attacker_uid` containing `{ role: "admin", email: "attacker@gmail.com", userId: "attacker_uid" }` when setup is already marked as finalized.
    *   **Rule Defense**: Blocked. The user registration validation prevents creation when the global `config/init` document reports `setupCompleted == true`.

3.  **Cross-Admin Resource Editing (Owner Spoofing)**:
    *   **Action**: Legitimate admin `auth.uid = "admin1"` attempts to standard code edit a document inside `/media/slide_xyz` owned by `ownerId = "admin2"`, or trying to construct a field change where they replace `ownerId` with another UID.
    *   **Rule Defense**: Blocked. Checks mandate `incoming().ownerId == existing().ownerId` and `existing().ownerId == request.auth.uid`.

4.  **Fake Claim Escalation**:
    *   **Action**: Attempting to bypass security by invoking custom claims or pretending to be an admin in client-side tokens without verification in the database.
    *   **Rule Defense**: Blocked. Standard database validation checks look up rules recursively via `exists(/databases/$(database)/documents/users/$(request.auth.uid))`.

### Schema, Size & Integrity Violations

5.  **Denial of Wallet Data Poisoning (Gigantic File Path)**:
    *   **Action**: Attempt to write a media node with a `title` of size 5MB or a document ID containing special path injection strings like `/media/sub_collection/attack`.
    *   **Rule Defense**: Blocked. Custom ID validation (`isValidId`) restricts characters to alphanumeric strings and length under 128 characters. Standard `size` validates name length (e.g. `title.size() <= 200`).

6.  **Mismatched MIME Formatting Attempt**:
    *   **Action**: Uploading a document pointing to `url: "https://...img.png"` but registering an invalid or malicious `type: "executable"` or `mimeType: "text/html"`.
    *   **Rule Defense**: Blocked. Validation rules mandate that `type` must match the enum constraints `["image", "video"]`.

7.  **Client-Provided Timestamp Spoof**:
    *   **Action**: Creating a slide and submitting standard client dates from 1999 or 2035 in the fields of `createdAt`.
    *   **Rule Defense**: Blocked. `incoming().createdAt == request.time` is strictly enforced.

8.  **Immutable Field Overwrite**:
    *   **Action**: Submitting an update to an existing slide attempting to update its original registration time `createdAt`.
    *   **Rule Defense**: Blocked. Immutability guards require `incoming().createdAt == existing().createdAt`.

### Process & State Transition Violations

9.  **Bypassing the Setup Gate (Forced Setup Overwrite)**:
    *   **Action**: Non-authenticated user attempts to issue `update` or `create` requests against `config/init` after setup is complete to slide in an additional admin.
    *   **Rule Defense**: Blocked. Non-authenticated users can never change the init config.

10. **State Shortcutting via Null Properties**:
    *   **Action**: Submitting a slide creation with the mandatory fields `url` or `duration` missing.
    *   **Rule Defense**: Blocked. Exact keys sizes checking (`incoming().keys().hasAll(...) && incoming().keys().size() == N`) rules it out.

11. **Negative Value / Overflow Attacks**:
    *   **Action**: Registering a slide with a `duration: -500` or `fileSize: -1e9` (large negative numbers) to break visual carousel timers.
    *   **Rule Defense**: Blocked. Bounds checks specify numeric values must be positive, e.g. `duration > 0 && duration <= 3600`.

12. **PII Information Query Leak**:
    *   **Action**: Authenticated user attempts a query list against `/users/*` mapping all emails.
    *   **Rule Defense**: Blocked. Direct listing of profiles is restricted. Only owner read or strict admin validations are permitted.

---
*(Note: As we are in a sandboxed, zero-compiled test environment, `firestore.rules` security rules acts as our active fortress security).*
