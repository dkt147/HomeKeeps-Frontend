# HomeKeep Phase 1 API Integration

This package was reconciled against the supplied Phase 1 specification and the supplied backend/frontend.

## Frontend integrated
- Console: service-case queue, queue summary, customer search, Customer 360, NBA, interactions, case detail mutations, warranty sale, opportunities, supervisor/SLA, products, settings.
- Admin: dashboard, warranty plans, eligibility rules, categories, manufacturers, service providers, stores, WhatsApp templates, automations, lead sources, lead import, five reports, audit log, webhook replay, message log, users/permissions, settings.
- Shared API helper: access/refresh rotation, 401 retry, standard API errors, FormData upload, idempotency header support.
- Removed remaining static "Needs an API" / preview screens.

## Backend corrections/additions
- Added admin interactions read API for message log.
- Added staff profile API at `/v1/admin/me` and `/v1/console/me`.
- Added Console product listing API.
- Added Store API authorization/validation.
- Added missing permissions for stores/interactions/webhook replay and permission-aware Admin reports/dashboard.
- Added permission protection to eligibility rules and opportunities.
- Added safe staff-user deactivation via DELETE.
- Corrected lead-file import authorization and frontend flow to the real source-based import API.
- Corrected Console warranty sale to require explicit `terms_accepted` and send customer_id.
- Added Phone/Completed interaction support for Console call logging.
- Corrected automation seed defaults and JSON action editing.
- Preserved Service First, eligibility, server-side pricing, idempotency, and Contract Snapshot enforcement.

## Important
Run `npm ci` in both projects before starting locally because dependency directories are intentionally not included in the ZIPs.
Run the backend permission/automation seed scripts after applying the backend package to an existing database so newly added permissions/automation definitions are available.

## Latest reconciliation fixes
- Confirmed the backend contract for Console Products and Console Me and added the missing backend routes.
- Corrected Console warranty-sale authorization to use `extended_warranties:create`, matching the backend permission matrix.
- Fixed the Console staff-profile controller import required by `/v1/console/me`.
- Sidebar navigation now loads the effective backend permission set and hides/blocks navigation items the current role cannot access.
- Direct navigation to a page without its required permission redirects to the valid landing page instead of rendering a guaranteed 403 screen.
