# Annex HR

**Automate Every Employee Journey.** Multi-tenant HR automation platform for modern African companies: onboarding, leave, attendance, consultant timesheets, payroll (PAYE / SHIF / NSSF / Housing Levy), performance, pulse surveys, compliance, disciplinary cases and offboarding.

## Repository layout

```
annex-hr/
├── .env                 # local secrets — never committed
├── .env.example         # template for .env
├── .gitignore
├── package.json         # npm workspaces + root scripts
├── frontend/            # React 19 · Vite · TypeScript · Tailwind v4 · React Router · Framer Motion · Recharts
├── backend/             # Express 5 · TypeScript · PostgreSQL (pg) · zod · JWT (httpOnly cookie)
│   └── src/
│       ├── config/      # env validation
│       ├── db/          # pool, migrations/*.sql, migrate + seed scripts
│       ├── middleware/  # auth (JWT cookie), role guards
│       ├── lib/         # errors, roles, audit log
│       └── modules/     # auth, workspace bootstrap, HR resources
└── shared/              # domain types + deterministic demo data used by both apps
```

## Getting started

```bash
cp .env.example .env     # then fill in database credentials and a JWT secret
npm install
npm run db:migrate       # creates tables inside DB_SCHEMA (default "annex-hr")
npm run db:seed          # loads the Umba, Annex Technologies and CHQI demo workspaces
npm run dev              # API on :4000, web app on http://localhost:5173
```

Vite proxies `/api` to the backend, so the browser talks to a single origin and the session cookie just works.

| Script | What it does |
| --- | --- |
| `npm run dev` | Backend (watch mode) and frontend together |
| `npm run build` | Production builds of both apps |
| `npm run typecheck` | Type-check backend and frontend |
| `npm run db:migrate` | Apply pending SQL migrations |
| `npm run db:seed` | Seed demo workspaces (skips ones that exist) |
| `npm run db:seed:force` | Delete and recreate the demo workspaces |
| `npm run db:reset` | Drop every table in `DB_SCHEMA`, migrate, seed (refused in production) |
| `npm start` | Run the built API (`backend/dist`) |

## Database

PostgreSQL, with **every table inside one schema** (`DB_SCHEMA`, default `annex-hr`). Each connection's `search_path` is pinned to that schema and nothing else in the database is touched. Migrations are plain SQL in `backend/src/db/migrations/`, tracked in `schema_migrations`.

Multi-tenancy: every tenant-owned row carries `workspace_id`, and each query is scoped to the caller's workspace. Accounts (`users`) belong to exactly one workspace, so employees can only sign in to their own organisation.

TLS: set `DB_SSL_CA_PATH` to Aiven's CA certificate (Aiven console → *Overview → CA certificate*) to verify the server certificate. Without it, TLS is still used but not verified.

Connection budget: small managed plans have few connections (Aiven hobby: 20, shared by every app on the instance). The API keeps `DB_POOL_MAX` low, loads the whole workspace in one round trip, and retries briefly when no slots are free.

## Signing in (demo data)

- Workspaces: `umba`, `annex`, `chqi`.
- Every seeded user's password is `SEED_DEFAULT_PASSWORD` from `.env`, e.g. `wanjiku.kamau@umba.com` (Company Admin, Umba).
- With `ENABLE_DEMO_LOGIN=true`, the login page offers one-click demo roles and the app's **View as** menu switches role. Set it to `false` in production.
- `VITE_USE_MOCK_API=true` runs the frontend entirely on in-browser demo data, with no backend.

## API overview (`/api`)

| Area | Endpoints |
| --- | --- |
| Health | `GET /health` |
| Auth | `POST /auth/register` · `POST /auth/login` · `POST /auth/logout` · `GET /auth/me` · `GET /auth/config` · `POST /auth/forgot-password` · demo: `POST /auth/demo`, `/auth/switch-role`, `/auth/switch-workspace` |
| Workspaces | `GET /workspaces/lookup/:slug` (public) · `GET /workspaces` · `GET /workspaces/current/bootstrap` |
| Invitations | `POST /invitations` · `GET /invitations` · `GET /invitations/:token` · `POST /invitations/:token/accept` |
| People | `GET/POST /employees` · `GET/PATCH /employees/:id` · `GET/POST /departments` · `PATCH /departments/:id` · `GET /org-chart` |
| Leave & time | `GET/POST /leave-requests` · `POST /leave-requests/:id/decision` · `GET/POST /holidays` · `GET /attendance/me` · `POST /attendance/clock-in` · `POST /attendance/clock-out` |
| Timesheets | `GET /timesheets` · `PUT /timesheets/week/:week` · `POST /timesheets/:id/submit` · `POST /timesheets/:id/decision` |
| Payroll | `GET/POST /payroll-runs` · `POST /payroll-runs/:id/approve` · `POST /payroll-runs/:id/sync-odoo` · `GET /payroll/preview/:employeeId` |
| Governance | `GET /policies` · `POST /policies/:id/acknowledge` · `POST /policies/:id/versions` · `GET /onboarding/me` · `POST /onboarding/tasks/:taskId/complete` · `GET/POST /compliance-documents` · `GET/POST /documents` · `/cases` (list, create, detail, advance, events, access, access-log) · `GET/POST /offboardings` · `PATCH /offboardings/:id` |
| Engagement | `GET/POST /surveys` · `POST /surveys/:id/responses` · `GET /kpis` · `PATCH /kpis/:id` · `GET /notifications` · `POST /notifications/:id/read` · `POST /notifications/read-all` · `GET /audit-logs` |

Server-side rules worth knowing: leave routes Manager → HR → CEO (CEO for >10 days, Maternity or Study), and nobody approves their own. Payroll needs Finance → HR → CEO sign-off, in order, before it can sync to Odoo. Confidential cases are visible only to HR admins and the CEO, and closing one needs CEO sign-off. Salaries and ID numbers are redacted for roles that shouldn't see them.

## Not yet wired

- Email delivery (invitations, verification codes, password reset) — the endpoints exist, and sending is marked `TODO`.
- File storage — uploads are recorded as metadata; `storage_key` columns are ready for S3 or similar.
- Odoo, KRA iTax and M-Pesa integrations are placeholders.
- Some screens still keep their changes in page state (e.g. surveys builder, case notes, offboarding checklist). Their API endpoints exist; the frontend calls for leave, payroll approval, notifications and all auth flows are wired.
