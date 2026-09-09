# Project setup decision

## Decision
Use one frontend repository/project for both Admin and Advisor Console.

The two areas remain physically separated under `admin/` and `console/`, but share `shared/js/api.js`, `shared/js/config.js`, `shared/js/admin-crud.js` and `shared/css/admin.css`.

## Integration workflow
1. Start backend on `http://localhost:5000`.
2. Start this frontend with `npm run dev`.
3. Login through the shared staff login.
4. Complete MFA.
5. Role determines the initial area and visible navigation.
6. Integrate and test API page-by-page.

## Current frontend baseline
The second/newer client ZIP was used as the baseline because it contains the first delivery plus the additional Admin screens (reports, warranty plans, eligibility rules, lead sources/import, automations, audit log, users, stores and webhook replay).
