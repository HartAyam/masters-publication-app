# Masters Publications ERP Platform
## Technical Architecture, Schema Specifications, and Production Deployment Guide

This documentation serves as the single source of truth for the technical architecture, data model, security frameworks, and multi-cloud deployment guidelines for the **Masters Publications Platform**—a unified ERP, POS, inventory, and payroll management system designed for multi-branch stationery and publishing operations.

---

## 1. Platform Architecture & Stack Overview

The platform uses a modern full-stack decoupled architecture that optimizes real-time operational speed, strict transactional consistency, and absolute server-side security.

```
+---------------------------------------------------------------------------------+
|                                 FRONTEND CLIENT                                 |
|         React 19 (SPA) | Vite 6 | Tailwind CSS v4 | Framer Motion (motion)      |
+------------------------------------+--------------------------------------------+
                                     |
              Client-Side Writes     |     Server-Side Privileged API
              (POS, Stock, Logs)     |     (User Creation, Passwords, Diagnostics)
                                     v
+------------------------------------+--------------------------------------------+
|                                BACKEND SERVICES                                 |
|                                                                                 |
|  +-------------------------------+   +---------------------------------------+  |
|  |     FIREBASE WEB CLIENT SDK   |   |           EXPRESS SERVICE API         |  |
|  |                               |   |             (server.ts / tsx)         |  |
|  |  * Real-Time Firestore Synch  |   |                                       |  |
|  |  * Direct Auth Token Swap     |   |  * Proxied Admin Actions via Port 3000|  |
|  |                               |   |  * Firebase Admin SDK Operations      |  |
|  +---------------+---------------+   +-------------------+-------------------+  |
|                  |                                       |                      |
+------------------|---------------------------------------|----------------------+
                   |                                       |
                   |      Enforces rules.firestore         |   Service Account App
                   +------------------+--------------------+   Credentials
                                      |
                                      v
+-------------------------------------+-------------------------------------------+
|                              PERSISTENCE & SECURITY                             |
|                                                                                 |
|                   Cloud Firestore  <========>  Firebase Auth                    |
+---------------------------------------------------------------------------------+
```

### Core Technologies
*   **Frontend SPA Framework:** `React 19` bootstrapped via `Vite 6` with `TypeScript`.
*   **Styling Engine:** `Tailwind CSS v4` featuring `@tailwindcss/vite` native CSS bundling for ultra-fast component styling, seamless grid system, and dynamic layout reflows.
*   **Routing System:** `React Router 7` with nested layouts and declarative component-level protection wrappers.
*   **Data Visualization:** `Recharts 3` and `D3` for custom responsive dashboards, dual-timeframe sales metrics, and pie-chart branch distribution.
*   **Animation Layer:** `framer-motion` (imported via `motion/react`) for fluid route changes, modal micro-transitions, and feedback ripples.
*   **Backend Proxy API:** `Express 4` server executing natively through `tsx` on Node.js to provide secure endpoints utilizing `firebase-admin` (v13) for elevated administrative workflows.
*   **Database & Auth Core:** `Google Firebase` (Firestore & Authentication) hosting multi-tenant records with role-based access controls (RBAC) validated directly inside `firestore.rules`.

---

## 2. Core Business Modules

The system's modular layout is built specifically to address the business flows of a multi-branch enterprise.

### 2.1 POS (Point of Sale) Engine (`/src/pages/POS.tsx`)
Provides a fast cash-register interface supporting quick-search items, dynamic receipt assembly, and payment processing.
*   **Transactional Modes:** Supports `Cash Sale`, `Credit Sale` (mapping outstanding amounts to the customer's account), `Deposit` (for pre-orders), `Stock Return`, and `Supply Note` documentation.
*   **Asset Consistency:** Atomically updates SKU levels upon transaction completion. On credit sales or deposits, updates customer ledger balances automatically.
*   **Payment Gateways:** Supports payment recording across cash registers, Mobile Money (MoMo), and Bank Transfers.

### 2.2 Inventory & SKU Management (`/src/pages/Inventory/`)
Maintains unified oversight of all products distributed across various physical warehouses and outlets.
*   **Restock Alerts:** Automatic visual alerts for items falling below specified `minStockLevel`.
*   **Damage Logs:** Track and write off damaged quantities with detailed branch attribution.
*   **Internal stock routing:** Out-of-the-box support for internal branch stock transfers with double-entry validation.

### 2.3 CRM & Supplier Registry (`/src/pages/Clients/` & `/src/pages/Suppliers/`)
Tracks external business relationships with a complete historic ledger.
*   **Customer Accounts:** Identifies entities as either `Individual` or `Organization`, monitors total outstanding debt, credit limits, and processes localized payment logs.
*   **Supplier Accounts:** Manages total payables, supply notes, and schedules historical settlement pay-outs.

### 2.4 Payroll & HR Infrastructure (`/src/pages/Payroll/`)
Tracks employee data and handles payroll approvals while remaining compliant with national standards (e.g., Ghana's SSNIT & PAYE tax systems).
*   **National Credentials:** Captures Social Security (SSN) and National Identity (Ghana Card) numbers on staff registry.
*   **Tax Calculator:** Computes SSNIT deductions (employee portion and employer contribution) and PAYE progressive tax brackets.
*   **Salary Approval Pipeline:** Multi-step salary state management (`Draft` -> `Pending Approval` -> `Approved` -> `Paid`).

### 2.5 Financial Statements & Fixed Assets (`/src/pages/Financials/`)
Enables accounting control through automated reporting and capital asset depreciation.
*   **Ledgers:** Supports balance sheets, cash flow tracking, multi-category expense reports, and real-time income statements.
*   **Fixed Asset Depreciation:** Calculates asset depreciation over custom schedules using annual straight-line rates.

### 2.6 Audit Logging Engine (`/src/services/audit.ts`)
Ensures robust corporate transparency by automatically writing non-repudiation event logs for any write operations.
*   **Metadata Captured:** User UID, display name, email, roles, target branch, descriptive action string, and server timestamps.

---

## 3. Database Schema Specifications (Cloud Firestore)

Firestore represents data inside document collections. The following models (derived from `/src/types/index.ts`) outline the exact database fields:

### 3.1 `users` (Collection: `/users/{uid}`)
Defines user credentials, physical branch boundaries, and application role permissions.
```typescript
interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  role: 'Cashier' | 'Manager' | 'Accountant' | 'Director' | 'Admin' | 'Marketer' | 'Driver';
  branchId: string; // Document ID of the assigned branch
  phone?: string;
  createdAt: firestore.Timestamp;
}
```

### 3.2 `staff` (Collection: `/staff/{id}`)
Stores employee HR profiles, contract details, and basic salaries.
```typescript
interface Staff {
  id: string;
  staffId?: string;
  email: string;
  displayName: string;
  role: Role;
  branchId: string;
  phone: string;
  basicSalary: number;
  ssnNo?: string;
  ghanaCardNo?: string;
  hireDate: firestore.Timestamp | string;
  createdAt: firestore.Timestamp;
  hasUserAccount?: boolean;
}
```

### 3.3 `products` (Collection: `/products/{id}`)
Standard SKU definitions bound to a physical branch location.
```typescript
interface Product {
  id: string;
  name: string;
  sku: string;
  price: number;
  costPrice: number;
  stockLevel: number;
  minStockLevel: number;
  damagedStock: number;
  branchId: string;
  category: string;
}
```

### 3.4 `transactions` (Collection: `/transactions/{id}`)
Represents invoices, sales orders, deposits, or returns.
```typescript
interface Order {
  id: string;
  type: 'Cash Sale' | 'Credit Sale' | 'Deposit' | 'Stock Return' | 'Supply Note';
  items: {
    productId: string;
    productName: string;
    quantity: number;
    price: number;
    total: number;
    suppliedQuantity?: number;
  }[];
  totalAmount: number;
  discount?: number; // Percentage
  amountPaid: number;
  balanceDue: number;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  status: 'Completed' | 'Pending Delivery' | 'Pending Payment' | 'Returned' | 'Adjusted' | 'Partially Supplied' | 'Supplied' | 'Voided';
  date: firestore.Timestamp;
  cashierId: string;
  preparedBy: string;
  suppliedBy: string;
  branchId: string;
  paymentMethod: 'Cash' | 'MoMo' | 'Bank Transfer';
  accountNumber?: string;
  bankName?: string;
  paymentDueDate?: firestore.Timestamp;
  isAdjusted?: boolean;
  adjustmentDate?: firestore.Timestamp;
  originalTransactionId?: string;
  voidReason?: string;
  voidDate?: firestore.Timestamp;
  voidedBy?: string;
}
```

### 3.5 `payments` (Collection: `/payments/{id}`)
Ledger settlements applied by customers against outstanding invoice balances.
```typescript
interface Payment {
  id: string;
  customerId: string;
  customerName: string;
  amount: number;
  previousDebt: number;
  newDebt: number;
  receivedBy: string;
  receivedById: string;
  date: firestore.Timestamp;
  paymentMethod: 'Bank' | 'MoMo' | 'Cash';
  accountNumber?: string;
  branchId: string;
  notes?: string;
  orderId?: string;
  reference?: string;
}
```

### 3.6 `expenses` (Collection: `/expenses/{id}`)
Monitors overheads, operating expenditure (OPEX), and purchases.
```typescript
interface Expense {
  id: string;
  date: firestore.Timestamp;
  amount: number;
  category: string;
  recipient: string;
  supplierId?: string;
  issuerId: string;
  approverName: string;
  branchId: string;
  description?: string;
}
```

### 3.7 `payroll` (Collection: `/payroll/{id}`)
Stores individual monthly employee pay sheets.
```typescript
interface PayrollRecord {
  id: string;
  employeeId: string;
  staffId?: string;
  employeeName: string;
  ssnNo?: string;
  ghanaCardNo?: string;
  month: string; // Format: "YYYY-MM"
  basicSalary: number;
  ssnit: number; // calculated SSNIT contribution
  paye: number;  // calculated PAYE tax
  otherDeductions: number;
  bonuses: number;
  netSalary: number;
  status: 'Draft' | 'Pending Approval' | 'Approved' | 'Paid';
  paymentDate?: firestore.Timestamp;
  branchId: string;
}
```

### 3.8 `activity_logs` (Collection: `/activity_logs/{id}`)
System activity and action events.
```typescript
interface ActivityLog {
  id: string;
  action: string;
  details: string;
  userId: string;
  displayName?: string;
  userEmail?: string;
  userRole: Role;
  branchId: string;
  timestamp: firestore.Timestamp;
}
```

### 3.9 `fixed_assets` (Collection: `/fixed_assets/{id}`)
Tracks business machinery, vehicles, and long-term properties.
```typescript
interface FixedAsset {
  id: string;
  name: string;
  category: string;
  purchaseDate: firestore.Timestamp;
  purchasePrice: number;
  currentValue: number;
  depreciationRate: number; // E.g., 15 for 15% per annum
  branchId: string;
  description?: string;
  createdAt: firestore.Timestamp;
}
```

### 3.10 `branches` (Collection: `/branches/{id}`)
Outlets registered under the company.
```typescript
interface BranchModel {
  id: string;
  name: string;
  location: string;
  managerId?: string;
  managerName?: string;
  contactPhone?: string;
  momoNumber?: string;
  isActive: boolean;
}
```

---

## 4. Security & Role-Based Access Control (RBAC)

The platform enforces zero-trust, defense-in-depth security both on the client and directly at the database layer.

### 4.1 Client-Side Navigation Boundaries (`<ProtectedRoute>`)
Users are restricted to areas permitted by their roles. Unprivileged access attempts redirect to `/unauthorized`.

| Role | Permitted Pages / Features |
| :--- | :--- |
| **Cashier** | Dashboard, POS terminal, OrdersList/Details, Inventory List, Clients List, Branches List |
| **Marketer** | Dashboard, Inventory List, Clients List |
| **Driver** | Dashboard, Active Delivery Orders, Branches List |
| **Manager** | POS, Orders, Inventory, Reports, Clients, Suppliers List/Details, Staff, Branches |
| **Accountant**| Orders, Inventory, Clients, Suppliers, Expenses, Payroll, Financial Statements, Fixed Assets, Payments by Source, Audit Logs, Staff, Branches |
| **Director / Admin** | Complete platform access, Global Admin Panel (`/admin`), Full User provisioning, Database migrations |

### 4.2 Database Security Rules (`firestore.rules`)
Firestore security rules run directly on Firestore nodes, validating authentication, payload shape, and role checks before any database query returns data or executes a write.

#### Core Security Functions:
*   `isAuthenticated()`: Asserts that requests contain valid Firebase Authentication tokens.
*   `isOwner(userId)`: Restricts read/write operations to the user's matching document identifier.
*   `getUserData()`: Dynamically reads the user's role and branch mapping from the `/users/{uid}` collection to authorize transactions.
*   `hasRole([roles])`: Validates whether the caller belongs to the allowed list of system-wide roles.
*   `isAdmin()`: True if the user role is `Admin` or `Director`.
*   `isAccountant()`: True if the user role is `Admin`, `Director`, or `Accountant`.
*   `isManager()`: True if the user role is `Admin`, `Director`, `Accountant`, or `Manager`.
*   `isStaff()`: True if the user is `Admin`, `Director`, `Accountant`, `Manager`, or `Cashier`.

#### Collection Enforcement Snippets:
*   **`users` Rules:** Users can read and write only their own profiles. Only Accountants/Admins can read all user files.
*   **`staff` Rules:** Restricted read access to Accountants/Admins. Direct modification and removal restricted solely to Admins.
*   **`products` Rules:** Read-access for all authenticated accounts. Mutations require a minimum of `Manager` role. Item deletion is restricted to Admins.
*   **`transactions` and `payments` Rules:** All authenticated staff can create orders or logs, but only an Accountant can make modifications.

### 4.3 Privileged Administration Server Proxy (`server.ts`)
To prevent exposing administrative database credentials to client browsers, the frontend routes sensitive user management actions to an Express proxy backend. This proxy runs server-side with the `firebase-admin` SDK.

These endpoints verify the caller's Firebase Auth token, check their role record in Firestore, and then execute privileged operations:
*   `GET /api/admin/check-permissions`: Service account diagnostics tool.
*   `POST /api/admin/create-user`: Provisions a user both in Firebase Auth (setting email and credentials) and sets up their accompanying Firestore `/users` profile document.
*   `POST /api/admin/update-user`: Safely modifies employee email addresses.
*   `POST /api/admin/change-password`: Modifies user login credentials for lost or compromised accounts.
*   `POST /api/admin/delete-user`: Deletes records from both Auth and Firestore databases.

---

## 5. Local Development Setup Guide

Follow these steps to run the complete multi-branch ERP platform on your local workstation.

### Prerequisites
*   **Node.js:** v18.0.0 or higher.
*   **Firebase Account:** A project set up via the Firebase Console.

### Step 1: Clone and Install Dependencies
```bash
# Install package dependencies
npm install
```

### Step 2: Establish Local Environment Variables
Create a `.env` file in the root directory. Paste your project's client-side variables and server configuration details:

```env
# Client-Side Firebase SDK Configuration
VITE_FIREBASE_API_KEY=your_api_key_here
VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
VITE_FIREBASE_APP_ID=your_app_id_here
VITE_FIREBASE_DATABASE_ID=(default)

# Server-Side Privileged API Variables (Optional for full-admin functionality locally)
# Pass the full single-line JSON string representing your Service Account Key JSON
FIREBASE_SERVICE_ACCOUNT_KEY={"type": "service_account", "project_id": "...", ...}
PORT=3000
```

### Step 3: Run the Development Server
```bash
npm run dev
```
The console will boot the server using the native TypeScript compiler `tsx`:
```text
[Server] Initializing Firebase Admin:
  Project ID: your_project_id
  Database ID: (default)
Server running on http://localhost:3000
```

---

## 6. Comprehensive Production Deployment Guide

Deploying the platform to a secure production environment requires setting up both cloud backend resources and frontend asset hosting.

### 6.1 Phase 1: Provisioning the Firebase Backend

1.  **Create a Firebase Project:**
    *   Navigate to the [Firebase Console](https://console.firebase.google.com/).
    *   Click **Add Project**, name it (e.g., `masters-publications-erp`), and optionally enable Google Analytics.
2.  **Enable Firebase Authentication:**
    *   Go to **Build** > **Authentication** > **Get Started**.
    *   Enable the **Email/Password** sign-in provider.
3.  **Enable Cloud Firestore Database:**
    *   Go to **Build** > **Firestore Database** > **Create Database**.
    *   Select **Start in production mode**.
    *   Choose a hosting region nearest to your target users (e.g., `us-central1` or `europe-west2`).
    *   Initialize the database with the default ID `(default)`.
4.  **Deploy Firestore Database Rules:**
    *   Open the database **Rules** tab.
    *   Copy and paste the exact contents of your local `firestore.rules` file and click **Publish**.
5.  **Deploy Database Indexes:**
    *   Create matching compound queries (or paste the contents of `firestore.indexes.json` inside the Firebase CLI and run `firebase deploy --only firestore:indexes`).

---

### 6.2 Phase 2: Generating Firebase Admin Service Credentials

To authorize the Node.js Express server to run administrative commands (like account creation and password resets), you must generate a secure service account credential file.

1.  In the Firebase Console, click the **Settings Cog (Gear)** > **Project Settings**.
2.  Select the **Service Accounts** tab.
3.  Click the blue **Generate New Private Key** button.
4.  Save the downloaded JSON file securely. 
5.  **Important Security Step:** Minify this JSON file into a single line to use as an environment variable in your production host (e.g., Cloud Run or App Engine). Keep this secret secure—never check it into Git or source control.

---

### 6.3 Phase 3: Production Builds & Server Packaging

The application is bundled for production by compiling front-end client code and running the TypeScript Express server behind the static file proxy.

```bash
# 1. Clean previous builds
npm run clean

# 2. Build production assets
# This compiles our client-side React code into the /dist directory
npm run build
```

The production runtime command `npm run start` is mapped inside `package.json` to:
```json
"start": "NODE_ENV=production npx tsx server.ts"
```
During execution under `NODE_ENV=production`, the Express server skips Vite asset injection, serves pre-built static assets from `/dist` directly, and runs the standard API routes for admin requests.

---

### 6.4 Phase 4: Multi-Cloud Hosting via Firebase App Hosting and GitHub

Firebase App Hosting is the next-generation platform for hosting server-rendered and full-stack dynamic React/Vite web applications. It integrates natively with GitHub to establish a seamless, serverless CI/CD pipeline. When a developer pushes to the tracked GitHub repository branch, Firebase App Hosting automatically triggers a build, provisions the required infrastructure, and deploys the full-stack container.

#### 1. The `apphosting.yaml` Configuration
The platform's runtime environment, environment variables, and secure secrets are managed directly via `/apphosting.yaml`. Below is the active production blueprint:

```yaml
kind: "AppHostingBackend"
schemaVersion: "v1"

# Environment variables available at runtime
env:
  - variable: NODE_ENV
    value: "production"
  - variable: FIREBASE_SERVICE_ACCOUNT_KEY
    secret: FIREBASE_SERVICE_ACCOUNT_KEY
  - variable: VITE_FIREBASE_PROJECT_ID
    value: "masters-publications-app"
  - variable: VITE_FIREBASE_DATABASE_ID
    value: "(default)"
  - variable: VITE_FIREBASE_API_KEY
    value: "AIzaSyAabvtGeapmMVjA81HmC7Wz6j3wnuxZOjc"
  - variable: VITE_FIREBASE_AUTH_DOMAIN
    value: "masters-publications-app.firebaseapp.com"
  - variable: VITE_FIREBASE_STORAGE_BUCKET
    value: "masters-publications-app.firebasestorage.app"
  - variable: VITE_FIREBASE_MESSAGING_SENDER_ID
    value: "586903405233"
  - variable: VITE_FIREBASE_APP_ID
    value: "1:586903405233:web:e4661fc56c1b5c8d50d890"
```

#### 2. Deploying via the Firebase Console

To initialize a new deployment connection:
1. Navigate to the [Firebase Console](https://console.firebase.google.com/) and open your project.
2. Under the Build menu, select **App Hosting** and click **Get Started**.
3. **Connect GitHub:** Authorize Firebase to access your GitHub account or Organization, then select the repository hosting your codebase.
4. **Configure Deployment Settings:**
   * Select your deployment branch (typically `main` or `production`).
   * Choose the deployment region closest to your main operations (e.g. `europe-west2`).
5. **Secure Administrative Credentials:**
   * The `FIREBASE_SERVICE_ACCOUNT_KEY` env parameter is loaded directly from **Google Cloud Secret Manager**.
   * In your Google Cloud console (under the same project), register a secret named `FIREBASE_SERVICE_ACCOUNT_KEY` with your minified service account JSON.
   * Grant the **App Hosting Service Agent** access permission to read this secret.

---

### 6.5 Phase 5: Pushing Updates & Continuous Deployment

Because the platform integrates directly with GitHub, rolling out feature updates, database migrations, or hotfixes does not require manual server restarts or manual container builds.

#### Step-by-Step Guide for Pushing Updates:

1. **Commit and Test Locally:**
   Always run local verification before pushing changes to the production branch:
   ```bash
   # Run the linter to verify syntactical correctness and type safety
   npm run lint

   # Compile the React bundle to ensure no compile-time regressions exist
   npm run build
   ```

2. **Commit Your Code Changes:**
   Use clear, descriptive commit messages to keep the git ledger readable:
   ```bash
   git add .
   git commit -m "feat: updated sales visualization and stabilized dashboard components"
   ```

3. **Push to the Production Branch:**
   Push the committed changes to your remote repository. Firebase App Hosting tracks this branch and will capture the push event immediately:
   ```bash
   git push origin main
   ```

4. **Monitor the Build Queue:**
   * Open the **App Hosting** dashboard in the Firebase Console.
   * You will see a new entry added to the **Rollouts** log.
   * Firebase App Hosting will automatically trigger a clean build (`npm run build`), package the server proxy, run any pre-start commands, and roll out the release to users with zero-downtime.

---

### 6.6 Phase 6: Verification & Post-Deployment Checklist

Once deployed, run these diagnostic checks to ensure the system is secure and operating as expected.

1.  **Platform Landing Page:** Open your Cloud Run deployment URL. The page should render the standard login screen or redirect to `/login`.
2.  **Configuration Check:** If the page displays the "Firebase Setup Required" modal, review your `VITE_FIREBASE_*` environment variables to ensure they are configured correctly.
3.  **Run System Diagnostics:**
    *   Sign in with an account that has `Admin` or `Director` role permissions.
    *   Navigate to the Admin Dashboard or execute a request to `/api/admin/check-permissions?adminToken=YOUR_ID_TOKEN`.
    *   Verify the response returns:
        ```json
        {
          "projectId": "masters-publications-erp",
          "authStatus": "OK",
          "firestoreStatus": "OK",
          "authUpdateStatus": "OK",
          "error": null
        }
        ```
    *   If `firestoreStatus` or `authUpdateStatus` returns a `PERMISSION_DENIED` error, verify that the Service Account has been granted the **Cloud Datastore User** and **Firebase Authentication Admin** roles in your Google Cloud IAM Console.

---

## 7. Operational Troubleshooting

| Symptom | Root Cause | Resolution |
| :--- | :--- | :--- |
| **"Firebase Setup Required" Modal remains visible** | Client environment variables are not resolving at build-time. | Ensure your variables are prefixed with `VITE_` in your hosting setup or `.env` files. Ensure you rebuild (`npm run build`) *after* modifying environment variables. |
| **Admin Panel actions result in `500 Server Error`** | Server-side Firebase Admin SDK fails authentication. | Verify that `FIREBASE_SERVICE_ACCOUNT_KEY` contains the exact service account JSON string, with all newline characters (`\n`) escaped inside double quotes. |
| **"Missing or Insufficient Permissions" during writes** | Firestore Security Rules block the operation. | Verify the active user's document exists inside `/users/{uid}` and contains a valid role string matching their expected permissions. |
| **Dual-branch visualization charts display no data** | No branch model documents configured. | Run the setup script or navigate to the Branch Management panel to initialize active branches matching your inventory locations. |
