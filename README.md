# HomeKeep Backoffice — Unified Admin + Advisor Console

This project combines the two frontend deliveries into **one codebase**. It keeps the Admin and Advisor Console as separate areas while sharing authentication, API client, styling and common utilities.

## Why one project

HomeKeep has one backend API and one database. The Phase 1 specification describes three clients: Customer App, Advisor Console and Admin. The Console and Admin are separate web experiences, but they should not become two unrelated frontend codebases. The unified structure below prevents duplicated API/auth/layout code.

## Structure

```text
homekeep-backoffice/
├── index.html                 # shared staff login
├── auth/
│   ├── mfa-setup.html
│   └── mfa-verify.html
├── console/                   # Advisor / Supervisor experience
│   ├── service-cases.html
│   ├── case-detail.html
│   ├── customers.html
│   ├── customer-detail.html
│   ├── products.html
│   ├── opportunities.html
│   ├── sale.html
│   ├── supervisor.html
│   └── index.html
├── admin/                     # Admin experience
│   ├── dashboard.html
│   ├── reports.html
│   ├── warranty-plans.html
│   ├── eligibility-rules.html
│   ├── product-categories.html
│   ├── manufacturers.html
│   ├── service-providers.html
│   ├── stores.html
│   ├── notifications.html
│   ├── automations.html
│   ├── message-log.html
│   ├── leads-import.html
│   ├── lead-sources.html
│   ├── webhook-replay.html
│   ├── users.html
│   ├── audit-log.html
│   ├── settings.html
│   └── index.html
├── shared/
│   ├── css/admin.css
│   └── js/
│       ├── config.js
│       ├── api.js
│       └── admin-crud.js
├── docs/
└── vite.config.js
```

## Run locally

Requirements: Node.js 20+ recommended.

```bash
npm install
npm run dev
```

Open the Vite URL shown in the terminal. The backend defaults to `http://localhost:5000`. Change `shared/js/config.js` if the backend runs elsewhere.

## Build

```bash
npm run build
npm run preview
```

## Authentication and roles

The shared API client stores the staff access/refresh tokens and staff profile. The sidebar is now area-aware and uses the role when the login response provides it. Server-side RBAC remains the real authority; the frontend only controls navigation/UX.

Roles from the Phase 1 specification: `advisor`, `supervisor`, `ops_admin`, `business_admin`, `system_admin`.

After MFA, the login flow routes staff into the appropriate area based on role. Unknown/missing role falls back to the Console during development.

## Important integration note

The latest frontend delivery contains several pages that are intentionally UI shells because the current backend/spec API contract does not expose all required endpoints yet. We will wire those pages during API integration rather than inventing endpoints.

## Source of truth

The HomeKeep Technical Specification — Phase 1 is the source of truth for screen scope, roles, permissions, business rules and API contract. In particular, the specification says the system has one API/database backing the Customer App, Advisor Console and Admin, with no duplicated business logic.
