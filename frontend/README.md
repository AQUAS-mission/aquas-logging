# aquas-logging / frontend

Next.js 15 (App Router) dashboard for AQUAS telemetry, built on shadcn/ui,
Recharts, and TanStack Table, with NextAuth for session auth.

**Setup and environment variables are documented in the [root README](../README.md).**
The short version:

```bash
cp .env.example .env.local     # then edit the credentials
npm install
npm run dev
```

The backend must be running too, or every panel will show a fetch error. See
the root README's [Running it locally](../README.md#running-it-locally).

## Layout

| Path | What's there |
| --- | --- |
| `app/page.tsx` | The dashboard. Redirects to `/login` without a session. |
| `app/login/page.tsx` | Sign-in form (inline, not `components/login-form.tsx`). |
| `app/api/auth/[...nextauth]/route.ts` | NextAuth credentials provider. |
| `components/section-cards.tsx` | 30-day averages per metric, vs. the previous 30 days. |
| `components/chart-area-interactive.tsx` | Metric trend chart with metric and time-range selectors. |
| `components/sensor-table.tsx` | Sortable, filterable table with CSV/JSON download. |
| `components/app-sidebar.tsx` | Sidebar. Only real destinations; add to `navMain` as routes land. |
| `components/ui/` | shadcn/ui primitives. Generated — avoid hand-editing. |

All three data components fetch `POST {NEXT_PUBLIC_API_BASE}/views/query`
independently on mount; there is no shared data layer or cache.

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | Dev server with Turbopack on :3000 |
| `npm run build` | Production build |
| `npm start` | Serve a production build |
| `npm run datagen` | Writes `mocks/sensor-data.json`. Not read by the app. |
