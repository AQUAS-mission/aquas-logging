## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

To pull live data from the FastAPI backend, set `NEXT_PUBLIC_API_BASE` in `frontend/.env` (defaults to `http://localhost:8000`) and ensure the backend is running. Selecting a view in the table triggers a POST to `/views/query` with the view ID.

## Dummy Data

To generate some dummy data for the main table, run `npm run datagen`


// make it so the filters have hard caps on them like ph between 0 - 14 or turbidity 0 --> anything etc.
