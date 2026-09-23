# Annex HR

**Automate Every Employee Journey.** A multi-tenant HR automation platform frontend for modern African companies — onboarding, leave, attendance, consultant timesheets, payroll (PAYE / SHIF / NSSF / Housing Levy), performance, pulse surveys, compliance, disciplinary cases and offboarding.

## Stack

React 19 · Vite · TypeScript · Tailwind CSS v4 · React Router · Framer Motion · Recharts · shadcn-style Radix components · lucide-react · sonner. No TanStack.

## Getting started

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build
```

## Demo

- **Landing page** at `/`.
- **Sign in** at `/login` — use workspace `umba` or `annex` with any email, or pick a role from *Demo accounts*.
- **Create a workspace** at `/signup` (3-step wizard).
- **Employee invitation flow** at `/invite/demo`.
- Inside the app, the **View as** menu in the top bar switches role (Company Admin, HR Officer, Manager, Employee, Consultant, Finance, CEO, Super Admin) so you can see role-based navigation and pages.
- The **workspace switcher** (sidebar) moves between Umba, Annex Technologies and CHQI — each has its own seeded employees, departments and records.
- `⌘K` / `Ctrl+K` opens the command palette.

All data is deterministic demo data in `src/data/seed.ts`; "today" is fixed at 23 Sep 2026 so dates always look current.

## Structure

```
src/
  components/
    ui/        shadcn-style primitives (button, dialog, sheet, tabs, select, …)
    shared/    enterprise building blocks (DataTable, StatCard, Stepper, Timeline,
               Kanban, FileUploader, DatePicker, ProgressRing, ExportMenu, …)
    charts/    ChartKit — validated categorical palette, tooltip, legend
    layout/    AppShell, Sidebar, Topbar, MobileNav, CommandPalette, WorkspaceSwitcher
  context/     auth (multi-tenant session + RBAC persona), theme, notifications
  data/        types + seeded workspace data
  lib/         rbac (roles → navigation), utils (formatting, dates)
  pages/
    landing/   marketing site
    auth/      login, signup wizard, forgot password, accept invite
    app/       one file (plus optional folder) per HR module
```

## Responsive behaviour

- Desktop: full sidebar (collapsible).
- Tablet: sidebar collapses to icons.
- Mobile: bottom navigation + slide-out drawer; tables render as cards; forms stack.

## Wiring a backend

Pages read from `useWorkspace()` (`src/context/auth.tsx`) and keep interactions in local state. To connect an API, replace the seed data in `AuthProvider` with fetched workspace data and turn the local-state actions (approve, submit, upload) into API calls.
