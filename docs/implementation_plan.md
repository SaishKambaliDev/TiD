# Cadence — Personal Behaviour-Aware Task & Daily Planning Platform

This plan defines the architecture and user experience for evolving the workspace into a full-stack personal task intelligence and daily planning system. It cleanly separates **what to work on** (a lightweight, task-centric Dashboard) from **when and how to finish it** (an interactive, routine-aware Daily Planner), anchored by a conversational **Daily Calibration Engine**, **Groq LLM task understanding**, **Bayesian personal learning**, and **MongoDB** persistence.

### User Review & Critical Decisions

> [!IMPORTANT]
> **Confirmed Architectural Decisions & Environment Requirements**
> Three foundational choices were confirmed during alignment and govern the entire build. Please review the environment requirements before proceeding to implementation:

- **MongoDB Persistence (`MONGODB_URI`)**: All user-scoped entities (users, tasks, routines, routine overrides, daily calibrations, daily plans, plan revisions, work sessions, behaviour profiles, and append-only task events) will be persisted via Mongoose schemas scoped by authenticated user ID with timezone-aware local date indexing. Runtime deployment will require a valid `MONGODB_URI` connection string (plus `JWT_SECRET` for session signing) configured in the environment.
- **Groq LLM Integration (`GROQ_API_KEY`)**: Natural-language task parsing, clarifying questions, independent AI effort estimation, milestone/dependency extraction, overlap suggestions, and free-text constraint parsing during Daily Calibration will call Groq's `llama-3.3-70b-versatile` model exclusively from the server using `GROQ_API_KEY`. The deterministic Bayesian learning, scheduling, deadline risk, and recommendation engines remain independent and intact.
- **Authentication First**: Launch opens on a dedicated Registration & Sign-In experience (including initial IANA timezone selection) backed by hashed credentials and HTTP-only JWT cookies, redirecting authenticated users directly to the Dashboard (`/dashboard`).
- **Automated Verification Strategy**: To run all 14 multi-user, cross-midnight, timezone, and scheduling integration tests reliably even without an external database during CI checks, our test runner will support an isolated test MongoDB URI or ephemeral in-memory MongoDB server while keeping production strictly bound to `MONGODB_URI`.

---

### 1. Overview & Core Concept

The platform guides each user through a continuous three-stage intelligence loop without crowding everything onto one screen:

1. **Understand My Day (Daily Calibration)**: Like pre-flight drone calibration, a brief, adaptive 30–60 second check-in captures today's energy, realistic capacity, temporary routine overrides, subjective workload, must-do priorities, session style, and free-text constraints. Calibration is temporary context—it never corrupts permanent behavioural traits and can be skipped or updated anytime via **Recalibrate my day**.
2. **Plan My Work (Daily Planner)**: A dedicated time-centric workspace computes realistic working capacity (separating waking hours, fixed/flexible routines, breaks, and buffers) and allocates tasks across available windows—supporting task splitting, compatible background overlaps, capacity-conflict resolution alternatives, drag-and-drop adjustments, and immutable plan revisions.
3. **Learn From My Work (Dashboard + Focus + Bayesian Engine)**: As the user completes tasks and logs active focus sessions on the Dashboard and Focus Mode, append-only task events feed a conjugate Bayesian engine that keeps population priors separate from personal posteriors, tracks uncertainty and observation counts, and surfaces only evidence-backed personal insights.

**Target Audience**: Students, engineers, researchers, and knowledge workers balancing structured daily commitments (classes, office hours, meals, sleep) with variable personal energy and complex project deadlines.

---

### 2. User Experience & Visual Design

#### Key User Flows

- **First Launch & Onboarding**: Unauthenticated visitors arrive at a calm split-pane Sign-In / Registration screen where new users set their name, email, password, and IANA timezone. Upon authentication, they land on `/dashboard`.
- **Morning Calibration Prompt**: On the first visit of a new local date without a `DailyCalibration` record, a soft non-blocking prompt invites the user into the conversational Daily Calibration modal/stepper (one question at a time with conditional follow-ups—e.g., asking for unavailable windows only if reduced capacity is selected, or lighter pacing if low energy is reported). Users can skip immediately (banner indicates context is unconfirmed) or complete calibration and jump straight into an adapted daily plan.
- **Task-Centric Dashboard (`/dashboard`)**:
  - **Header**: Friendly time-of-day greeting, formatted local date, live search bar, actionable notifications popover (deadline risks, unconfirmed calibration, recalibration prompts), and user profile menu.
  - **Compact Today's Progress Bar**: Single crisp horizontal summary strip showing tasks completed, tasks remaining, logged focus time, and daily completion progress using tabular figures.
  - **Today's Tasks (Primary Focal Anchor)**: Clean task rows/cards displaying title, priority, user vs. AI effort estimate, deadline, status, milestone progress, and category as unboxed metadata. Inline actions allow completing a task, opening details, launching Focus Mode, editing, sending to the Planner, or viewing task-specific recommendations.
  - **Side Column**: Compact Focus Session entry widget, 1–2 evidence-backed Personal Insights (rendered only when observation thresholds are met), Upcoming Deadlines list, and quick **Add Task** trigger. No calendar or timeline grid appears on this page.
- **Add Task with Groq NLU**: User enters natural language (e.g., *"Finish compiler lab report by Friday, needs 3 hours of deep coding, depends on parser tests"*). Server calls Groq to extract structured fields, ask clarifying questions if ambiguous, suggest milestones/dependencies, classify execution attention (`attention_intensive`, `background`, `partially_attentive`), and generate an independent AI effort estimate alongside the user's own estimate—never overwriting the user's estimate.
- **Visual Daily Planner (`/planner`)**:
  - **Top Controls**: Day navigator (previous/today/next + date picker), timeline zoom (`30m` / `1h` / `15m`), **Generate Plan**, **Recalibrate My Day**, and **Revisions** drawer to compare planned vs. actual or prior plan versions.
  - **Capacity Strip**: Explicit breakdown of *Total Waking Time*, *Committed Routine Time*, *Available Capacity*, *Scheduled Task Time*, *Unallocated Time*, and *Buffer Time* (never treating all waking hours as workable).
  - **Interactive Timeline & Waiting List**: Left/main visual timeline displaying routine blocks (sleep, meals, classes/work, exercise, one-day overrides), breaks, scheduled task blocks (drag-and-drop & edge-resizable), and side-by-side compatible background activities with explicit overlap warnings and user confirmation. Right panel houses the Unscheduled Task Waiting List, Drag-to-Schedule queue, and Capacity-Insufficient Resolution modal (reschedule another task, move to waiting list, change priority, reduce scope, extend deadline, or split across days).
- **Supporting Routes**:
  - **My Tasks (`/tasks`)**: Full backlog management with filters, dependency links, user vs. AI vs. actual effort columns, and execution type tags.
  - **Focus Mode (`/focus`)**: Distraction-free active session timer with play/pause/complete, active vs. elapsed time tracking, compatible background task pairing, and interruption logging.
  - **My Insights (`/insights`)**: Planned vs. actual timeline variance, calibration energy/capacity correlation charts (only where real observations exist), and deadline risk summaries.
  - **Recommendations (`/recommendations`)**: Transparent, explainable scheduling, splitting, risk-mitigation, and overlap suggestions with one-click apply/dismiss actions.
  - **My Behaviour (`/behaviour`)**: Bayesian personal profile vs. population baseline comparison, posterior uncertainty intervals, estimation bias ratios, postponement/initiation metrics, and append-only `TaskEvent` audit feed.
  - **Settings (`/settings`)**: Full recurring `DailyRoutine` manager (activity name, start/end, recurrence days, type, fixed vs. flexible, movable flag, notes), one-day routine override manager, timezone selector, default working hours/buffer preferences, and account settings.

#### Visual Identity & Theme

- **Aesthetic Direction**: Warm daylight editorial productivity studio—calm, tactile paper-and-ink clarity with soft pastel semantic accents and zero generic dark-neon AI clichés.
- **Color Palette & Tokens**:
  - *60% Neutral Canvas*: Warm Off-White / Cream (`--bg-canvas: #FAF8F5`) and Crisp Paper White (`--bg-surface: #FFFFFF`) with Deep Charcoal ink (`--text-primary: #1F2421`, `--text-secondary: #5C645E`).
  - *30% Structural Surfaces*: Soft Stone borders (`1px solid rgba(31, 36, 33, 0.08)`), subtle surface contrast (`#F3EFE8`), hairline dividers.
  - *10% Semantic & Organic Accents* (always paired with explicit text labels, never hue-only): Soft Lavender (`#E9E4F5` / `#5F4B8B`) for calibration & insights, Muted Peach (`#FCE8DF` / `#B85D3E`) for deadlines & high-priority focus, Sage Green (`#E3EFE7` / `#2E6F4E`) for completed work & available windows, Sky Blue (`#E1EFF8` / `#2B6CB0`) for routines & background overlaps, Subtle Yellow (`#FAF0CA` / `#856404`) for buffer/caution indicators.
- **Typography & Hierarchy**:
  - *Display & Headings*: `Plus Jakarta Sans` (SemiBold 600 / Bold 700, `text-wrap: balance`).
  - *Body Prose*: `DM Sans` (Regular 400 / Medium 500, 15px–16px base, relaxed readability).
  - *Numeric Telemetry*: `JetBrains Mono` with `font-variant-numeric: tabular-nums` across all durations, effort estimates, capacity totals, and timeline markers.
- **Layout & Component Discipline**:
  - Fixed 240px left workspace sidebar (collapsing cleanly to a responsive drawer on mobile) paired with a strict 3-zone top bar (page context/greeting, search/date, primary action + profile).
  - Single-elevation flat cards with subtle 1px hairlines (no nested cards-within-cards, no thick `border-l-4` left accent stripes, no static pill boxes around metadata—quiet `·` / `/` typographic separators instead).
- **Interactive Feedback & Motion**:
  - Powered by `motion` (Framer Motion) strictly animating `transform` and `opacity` with ≤200ms crisp settling (`cubic-bezier(0.16, 1, 0.3, 1)`), smooth step transitions in Daily Calibration, drag/drop snapping feedback on the Planner, and full `prefers-reduced-motion` support.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1 — Strict Separation of Dashboard and Planner**:
  - *Chosen Approach*: Keep `/dashboard` focused exclusively on prioritized tasks, progress, deadlines, and insights while isolating all time-blocking, routines, and capacity math in `/planner`.
  - *Why*: Mixing a calendar grid with task triage creates visual overload and encourages calendar micromanagement instead of clear execution.
  - *Alternatives Considered*: Embedding a mini daily timeline on the Dashboard (rejected to preserve lightweight task focus).

- **Decision 2 — Non-Destructive Recalibration & Plan Revisions**:
  - *Chosen Approach*: Store `DailyPlan` with embedded or linked `ScheduledTaskBlock` entries and snapshot every generation or recalibration into `DailyPlanRevision` before applying diffs. Recalibration preserves completed blocks, active sessions, and past work logs, presenting a preview diff for confirmation when major shifts occur.
  - *Why*: Users need confidence that changing their afternoon plan won't erase morning accomplishments or silently drop commitments.
  - *Alternatives Considered*: In-place overwriting of schedule blocks (rejected because planned-vs-actual learning requires historical snapshots).

- **Decision 3 — Separation of Temporary Calibration vs. Permanent Bayesian Behaviour**:
  - *Chosen Approach*: Store daily self-reported context in `DailyCalibration` (scoped by user + local date) completely separate from `PersonalBehaviourProfile` (updated only via observed `TaskEvent` completions and session durations using Bayesian conjugate updates).
  - *Why*: A single tired Tuesday must adapt *today's* schedule immediately without biasing long-term effort estimation priors. Correlations between calibration signals and outcomes are analyzed over multiple observations with explicit uncertainty bounds.
  - *Alternatives Considered*: Adjusting personal effort multipliers directly from daily energy answers (rejected as statistically noisy and misleading).

- **Decision 4 — Hybrid Groq NLU + Deterministic Scheduling & Bayesian Intelligence**:
  - *Chosen Approach*: Use Groq (`llama-3.3-70b-versatile` in strict JSON mode) strictly for language understanding (parsing task text, generating clarifying questions, estimating baseline AI effort, extracting constraints from calibration text, and suggesting potential overlaps), while deterministic server engines handle time-window arithmetic, timezone/midnight crossing, overlap validation, Bayesian updates, and deadline risk math.
  - *Why*: Guarantees reliable capacity math, zero hallucinated availability, deterministic constraint enforcement, and full auditability.
  - *Alternatives Considered*: Prompting an LLM to generate the entire daily schedule JSON directly (rejected due to arithmetic/overlap hallucinations and inability to maintain Bayesian posteriors).

- **Decision 5 — Cross-Midnight & Multi-Timezone Correctness**:
  - *Chosen Approach*: Store all timestamps in UTC, store user preferences as standard IANA timezone strings (e.g. `Asia/Kolkata`, `America/Los_Angeles`), and interpret `YYYY-MM-DD` planner dates and routine `HH:mm` windows in the user's configured timezone—splitting routines or sleep blocks that cross `00:00` cleanly across adjacent local days.
  - *Why*: Prevents off-by-one day shifts and broken night-owl or sleep routines across timezones.
  - *Alternatives Considered*: Server-local `Date` math (rejected as broken for multi-timezone users).

---

### 4. Technical Architecture & Data Strategy *(Technical Reference)*

#### Architecture & Component Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        REACT SPA CLIENT (Vite + Tailwind + Motion)           │
│  ┌─────────────┐  ┌────────────────────────────────────────────────────────┐ │
│  │ Auth Gate   │  │ Authenticated Shell (240px Sidebar + 3-Zone Top Bar)   │ │
│  │ /login      │  ├──────────────┬──────────────┬──────────────────────────┤ │
│  │ /register   │  │ /dashboard   │ /planner     │ /tasks · /focus          │ │
│  └──────┬──────┘  │ (Task-first) │ (Timeline)   │ /insights · /behaviour   │ │
│         │         │              │              │ /recommendations         │ │
│         │         │              │              │ /settings                │ │
│         │         └──────┬───────┴──────┬───────┴────────────┬─────────────┘ │
│         │                │              │                    │               │
│         │         ┌──────▼──────────────▼────────────────────▼─────────────┐ │
│         │         │        Conversational Daily Calibration Overlay        │ │
│         │         └──────────────────────────┬─────────────────────────────┘ │
└─────────┼────────────────────────────────────┼───────────────────────────────┘
          │ HTTP JSON + HTTP-Only JWT Cookies  │
┌─────────▼────────────────────────────────────▼───────────────────────────────┐
│                      EXPRESS REST API SERVER (/api/v1/*)                     │
│  ┌────────────────┐  ┌──────────────────┐  ┌──────────────────────────────┐  │
│  │ Auth & User    │  │ Routine &        │  │ Planner, Capacity &          │  │
│  │ Middleware     │  │ Calibration APIs │  │ Recalibration APIs           │  │
│  └───────┬────────┘  └────────┬─────────┘  └──────────────┬───────────────┘  │
│          │                    │                           │                  │
│  ┌───────▼────────────────────▼───────────────────────────▼───────────────┐  │
│  │                     CORE INTELLIGENCE ENGINES                          │  │
│  │  • Capacity Calculator (Routines + Overrides + Calibration + Buffers)  │  │
│  │  • Scheduling Engine (Splits, Dependencies, Overlap Compatibility)     │  │
│  │  • Bayesian Learning Engine (Separate Population vs Personal Priors)   │  │
│  │  • Deadline Risk & Recommendation Engines                              │  │
│  │  • Groq NLU Service (llama-3.3-70b-versatile via GROQ_API_KEY)         │  │
│  └───────────────────────────────────┬────────────────────────────────────┘  │
│                                      │ Mongoose ODM (User-Scoped Queries)    │
│  ┌───────────────────────────────────▼────────────────────────────────────┐  │
│  │                     MONGODB (via MONGODB_URI)                          │  │
│  │  Users · Tasks · WorkSessions · TaskEvents · PersonalBehaviourProfiles │  │
│  │  DailyRoutines · DailyRoutineOverrides · DailyCalibrations             │  │
│  │  DailyPlans · DailyPlanRevisions                                       │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

#### Data Model & State

All domain models carry an indexed `userId` reference so every query and mutation enforces strict tenant isolation:

- **User**: Email, hashed password, display name, IANA `timezone`, default working preferences (break duration, buffer ratio, focus session default), timestamps.
- **Task**: Title, description, category, priority, status (`todo`, `in_progress`, `completed`, `waiting_list`), deadline (UTC), `userEstimatedMinutes`, `aiEstimatedMinutes`, `recommendedMinutes`, `actualMinutes`, `elapsedCalendarMinutes`, `attentionClass` (`attention_intensive`, `background`, `partially_attentive`), `overlapAllowedWith`, `splittingPreference` (`continuous`, `shorter_sessions`, `ai_suggested`), milestones array, dependency task IDs, and Groq understanding metadata.
- **WorkSession**: Links `userId`, `taskId`, `planDate`, start/end timestamps, `activeDurationMinutes`, `pausedDurationMinutes`, paired background `taskId` (if any), and completion outcome.
- **TaskEvent (Append-Only)**: Immutable audit stream (`created`, `started`, `paused`, `completed`, `postponed`, `rescheduled`, `estimate_revised`, `recalibrated`) storing context snapshots (estimated vs. actual minutes, deadline slack, energy calibration tag) to drive Bayesian updates without mutating history.
- **PersonalBehaviourProfile**: Separate from population priors; tracks conjugate Bayesian posteriors per task category/complexity (effort multiplier mean & variance, observation counts, initiation lag, postponement rate, workload tolerance curve, deadline sensitivity, and uncertainty flags).
- **DailyRoutine & DailyRoutineOverride**: Recurring weekly routine definitions (activity name, `HH:mm` start/end including cross-midnight support, recurrence weekday bitmask/array, type, `isFixed`, `isMovable`, notes) plus date-keyed `DailyRoutineOverride` entries (`YYYY-MM-DD` in user's local timezone) that modify or disable a routine block for a single day without altering the recurring template.
- **DailyCalibration**: Keyed uniquely by `(userId, localDate)`. Captures status (`completed`, `skipped`, `pending`), `energyLevel`, `availableCapacityChoice`, explicit `availableWindows`, `customCommitments`, `workloadPerception`, `priorityTaskIds` / custom priorities, `preferredSessionStyle`, `preferredSessionMinutes`, `preferredBreakMinutes`, raw `unexpectedConstraintsText`, Groq-extracted structured constraints, and `updatedAt`.
- **DailyPlan & DailyPlanRevision**: `DailyPlan` holds the active schedule for `(userId, localDate)` including computed capacity breakdown, `ScheduledTaskBlock` list (start/end, task ID, `isSplitPart`, `isBackgroundOverlap`, `overlapConfirmed`, `status`), break blocks, unscheduled waiting-list tasks with insufficiency reasons, and `revisionNumber`. `DailyPlanRevision` stores immutable snapshots before every generation or recalibration (`triggerReason`, `blocksSnapshot`, `capacitySnapshot`, `diffSummary`) for planned-vs-actual auditing.

#### Interactive Component & State Mapping

- **Auth Gate & Session Context**: Validates credentials via `/api/v1/auth/*`, hydrates authenticated user profile and timezone, and guards all protected routes (`/` redirects to `/dashboard` when authenticated or `/login` when signed out).
- **Daily Calibration Flow**: Checks `/api/v1/daily-calibration/:date` on initial workspace mount for the user's current local date. Advances step-by-step with adaptive branching (skipping irrelevant follow-ups), calls Groq constraint extraction on optional free text before saving, and immediately triggers schedule preview on the Planner if desired.
- **Task Creation & Estimation Modal**: Sends natural-language description to `/api/v1/tasks/understand` (Groq), displays extracted attributes and clarifying questions if needed, requires/accepts separate user estimate alongside AI estimate, checks today's remaining capacity, and offers immediate scheduling options.
- **Planner Interactive Workspace**: Fetches `/api/v1/planner/:date` (aggregating routine, overrides, calibration, capacity breakdown, active plan, and unscheduled tasks). Supports:
  - Dragging unscheduled tasks onto open timeline slots or resizing blocks (validating against fixed routines, unavailable slots, and overlap compatibility via `PATCH /api/v1/planner/:date`).
  - Clicking **Generate Plan** (`POST /api/v1/planner/:date/generate`) to compute an optimal split/dependency-aware allocation.
  - Clicking **Recalibrate My Day** (`POST /api/v1/planner/:date/recalibrate`) after updating circumstances to preview proposed changes while keeping completed/active sessions intact, requiring explicit confirmation before committing and saving a `DailyPlanRevision`.
  - Resolving insufficient capacity via modal actions that update priorities, deadlines, scope, waiting list status, or multi-day splits cleanly.
- **Dashboard & Focus Execution Loop**: Completing a task or finishing a Focus session emits an append-only `TaskEvent`, updates `actualMinutes` and `elapsedCalendarMinutes`, updates the `PersonalBehaviourProfile` Bayesian posteriors on the server, refreshes Dashboard progress/insights, and updates the active day's Planner block status without erasing historical plan snapshots.

#### Key Sequences & API Surface

REST endpoints follow `/api/v1/*` conventions with request validation and strict user-ID authorization:

- **Auth & Profile**: `/api/v1/auth/register`, `/api/v1/auth/login`, `/api/v1/auth/logout`, `/api/v1/auth/me`, `/api/v1/settings`
- **Tasks, NLU & Sessions**: `/api/v1/tasks` (CRUD), `/api/v1/tasks/understand` (Groq NLU + clarifying Qs + AI estimate), `/api/v1/sessions` (start/pause/complete), `/api/v1/dashboard` (aggregated lightweight dashboard payload)
- **Intelligence & Learning**: `/api/v1/insights`, `/api/v1/recommendations` (list/apply/dismiss), `/api/v1/behaviour` (posteriors + append-only event history)
- **Routines & Overrides**: `/api/v1/routines` (GET/POST/PATCH/DELETE), `/api/v1/routines/overrides/:date` (GET/PUT/DELETE)
- **Daily Calibration**: `/api/v1/daily-calibration/:date` (GET/PATCH), `/api/v1/daily-calibration` (POST)
- **Daily Planner & Revisions**: `/api/v1/planner/:date` (GET/PATCH), `/api/v1/planner/:date/generate`, `/api/v1/planner/:date/recalibrate`, `/api/v1/planner/:date/revisions`
