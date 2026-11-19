# TiD — Take it Done

A behaviour-aware task manager and daily planner. TiD keeps task triage on a calm, paper-inspired dashboard and moves time-blocking, routines, and capacity math into a dedicated visual planner. A short daily calibration plus an evidence-backed learning engine adapts the plan to how you actually work.

## Features

- **Task-first dashboard** — natural-language task capture, priorities, deadlines, milestones, user vs. AI estimates, and inline focus actions.
- **Daily calibration** — a quick check-in for energy, realistic capacity, routine overrides, and must-do work. Skippable and never destructive.
- **Visual daily planner** — capacity breakdown, routine blocks, drag-and-drop schedule blocks, background-task overlap warnings, and immutable plan revisions.
- **Focus mode** — distraction-free session timer with active/elapsed tracking and interruption logging.
- **Explainable recommendations** — scheduling, splitting, deadline-risk, and overlap suggestions you can apply or dismiss.
- **Behavioural learning** — a conjugate Bayesian profile that keeps population priors separate from personal observations and only surfaces evidence-backed insights.
- **Insights & behaviour views** — planned vs. actual variance, energy/capacity correlation, posterior uncertainty, and an append-only task event feed.
- **Light & dark themes** — plain-color dark palette with smooth theme transitions and reduced-motion support.

## Tech stack

React 19, TypeScript, Vite 8, Tailwind CSS 4, Express, MongoDB/Mongoose, Groq LLM, JWT auth, and Node's built-in test runner.

## Getting started

**Prerequisites:** Node.js 20.19+ (Node 22 recommended) and a MongoDB instance (local or Atlas).

```bash
git clone https://github.com/SaishKambaliDev/TiD.git
cd TiD
npm install
cp .env.example .env
```

Fill in `.env`, then start the app:

```bash
npm run dev
```

The dev server runs at `http://localhost:3000`. Register an account to enter the workspace.

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `MONGODB_URI` | Yes for persistence | MongoDB connection string |
| `JWT_SECRET` | Yes | Secret used to sign HTTP-only session cookies |
| `GROQ_API_KEY` | For AI task parsing | Server-side Groq LLM API key |
| `GROQ_MODEL` | No | Groq model id (defaults are set in `.env.example`) |
| `APP_URL` | Deployment | Public URL of the hosted app |
| `GEMINI_API_KEY` | AI Studio only | Runtime-provided key in AI Studio |
| `PORT` | No | Server port, defaults to `3000` |

Secrets are read only from `.env`; `.env` is gitignored. Never commit real keys.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start Express + Vite in development |
| `npm run build` | Build the production client into `dist/` |
| `npm start` | Serve the built app in production |
| `npm run lint` | TypeScript typecheck without emitting files |
| `npm test` | Run the engine/integration tests |

## Project layout

- `src/` — React app, pages, components, theme/auth contexts, API client, and shared types.
- `server/` — Express routes, Mongoose models, middleware, and deterministic engines (capacity, scheduling, overlap, risk, Bayesian learning).
- `tests/` — Node test runner suites for scheduling, capacity, timezone, and learning behaviour.
- `docs/implementation_plan.md` — architecture and UX design notes.

## Health check

With the server running, `GET /api/health` reports database status and whether the Groq key is configured.
