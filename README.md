# Mailbox

Mailbox is a full-stack, Gmail-style email client. A React single-page app talks to a REST API built with Node.js and Express, which stores everything in PostgreSQL using raw, parameterized SQL (no ORM). You can browse the inbox, sent, starred, trash and label views, search, read, star and trash emails, compose new ones, and act on many emails at once. The database is seeded with 100,000 realistic emails. A composite index makes the inbox query about 100× faster (14.16 ms to 0.138 ms), measured with `EXPLAIN ANALYZE`, and 29 Jest + Supertest tests cover the API, including a test proving one user can never read another user's mail.

![Mailbox screenshot](docs/screenshot.png)

**Live demo:** https://YOUR-APP.vercel.app · **API:** https://YOUR-API.onrender.com/api/health

> The API runs on Render's free tier, which sleeps after 15 minutes without traffic. The first request after that can take around 30 seconds while it wakes up; after that it's fast.

## Features

- Inbox, Starred, Sent, Trash and per-label views, with unread counts in the sidebar
- Pagination ("1–20 of 2,075") with the page number in the URL
- Search across subject, body and sender, debounced by 300 ms and stored in the URL so results can be shared and survive a refresh
- Read an email (opening it marks it read), with its labels
- Star, mark unread, move to trash, and permanently delete (only from trash)
- Compose with client-side validation, a disabled Send button while sending, and a success toast. Mail to another Mailbox user lands in their inbox.
- Bulk actions on selected rows: mark read, mark unread, move to trash
- Optimistic star and read toggles that roll back with an error toast if the request fails
- Loading, error (with retry) and empty states on every data view
- Responsive: under 768px the sidebar becomes a slide-in drawer and compose goes full screen
- Accessible: real buttons, labelled inputs, visible focus styles, a keyboard-friendly compose dialog (Esc closes it)

## Tech stack

| Layer | Tools |
|---|---|
| Client | React 18, Vite, React Router 7, plain CSS with CSS variables |
| Server | Node.js 20+, Express 5, `pg` (raw SQL), `zod` validation, `cors`, `dotenv` |
| Database | PostgreSQL 16+ (Neon in production, Docker locally if you like) |
| Tests | Jest, Supertest |
| Seeding | `@faker-js/faker` |
| Hosting | Vercel (client), Render (API), Neon (database) |

## Architecture

```
 ┌───────────┐      ┌─────────────────────┐   HTTPS + JSON    ┌──────────────────────────┐   SQL ($1, $2)   ┌──────────────┐
 │  Browser  │ ───▶ │  React SPA (Vite)   │ ────────────────▶ │  Express API  (/api)     │ ───────────────▶ │  PostgreSQL  │
 │           │ ◀─── │  React Router       │ ◀──────────────── │  cors → json → user →    │ ◀─────────────── │  users       │
 └───────────┘      │  useEmails, api.js  │   200 / 4xx JSON  │  zod validate → route →  │      rows        │  emails      │
                    └─────────────────────┘                   │  pg Pool → error handler │                  │  labels      │
                       hosted on Vercel                       └──────────────────────────┘                  │  email_labels│
                                                                    hosted on Render                        └──────────────┘
                                                                                                              hosted on Neon
```

## Local setup

You need Node.js 20+ and a PostgreSQL database: either Docker (`docker compose up -d` starts Postgres 16 and the defaults in `.env.example` already match it) or a free [Neon](https://neon.tech) database, whose connection strings go into `server/.env`.

```bash
git clone https://github.com/YOUR-USERNAME/mailbox.git && cd mailbox
cp server/.env.example server/.env        # then edit DATABASE_URL and DATABASE_URL_TEST
npm --prefix server install
npm --prefix server run db:reset          # creates the tables and seeds 100,000 emails
npm --prefix server run benchmark         # measures the inbox query and adds the index
npm --prefix server run dev               # API on http://localhost:4000
cp client/.env.example client/.env        # in a second terminal
npm --prefix client install
npm --prefix client run dev               # app on http://localhost:5173
```

> `db:reset` drops the inbox index on purpose (it isn't in `schema.sql`), so run `benchmark` again after every reset to put it back.

## API

All routes are under `/api`. There is no login yet: the API treats `DEMO_USER_ID` from `.env` as the current user, and every query is filtered by that user's id.

| Method | Path | Purpose | Success |
|---|---|---|---|
| GET | /health | Health check | 200 |
| GET | /me | Current user, plus inbox unread count | 200 |
| GET | /emails | List. Query: `folder` (default inbox), `page` (default 1), `limit` (default 20, max 50), `q`, `starred=true`, `label`. Returns `{ data, page, limit, total, totalPages }` with a 120-character `snippet` instead of the body | 200 |
| GET | /emails/:id | One email with its labels | 200 / 404 |
| POST | /emails | Compose `{ to, subject, body }`. Saves a copy in your Sent and, if `to` is a Mailbox user, an unread copy in their Inbox | 201 |
| PATCH | /emails/:id | Update any of `is_read`, `is_starred`, `folder` | 200 / 404 |
| DELETE | /emails/:id | Permanently delete. Only allowed from trash, otherwise 409 | 204 / 404 / 409 |
| GET | /labels | Your labels with unread counts | 200 |
| POST | /emails/:id/labels | Add a label `{ labelId }` | 201 |
| DELETE | /emails/:id/labels/:labelId | Remove a label | 204 |

Invalid input returns **400** with `{ error: { message, details } }`. Unknown routes return a 404 JSON error. Stack traces are never sent when `NODE_ENV=production`.

## Index benchmark

`npm --prefix server run benchmark` runs the API's exact inbox query (`WHERE user_id = $1 AND folder = $2 ORDER BY created_at DESC LIMIT 20`) five times without an index and five times with it:

```sql
CREATE INDEX idx_emails_user_folder_created ON emails (user_id, folder, created_at DESC);
```

| Inbox query (100,000 emails) | Without index | With index |
|---|---|---|
| Median execution time (5 runs) | **14.16 ms** | **0.138 ms** (about 103x faster) |
| Plan | Seq Scan + Sort | Index Scan, no Sort |
| Rows read and thrown away | 97,925 | 0 |
| Pages read (8 kB each) | 5,703 | 23 |

Full plans and the reasoning behind the column order are in [docs/benchmark.md](docs/benchmark.md).

## Tests

```bash
npm --prefix server test
```

29 Jest + Supertest tests run against a separate test database (`DATABASE_URL_TEST`). Before every test the tables are rebuilt and loaded with a small fixed data set ([server/tests/fixtures.sql](server/tests/fixtures.sql)), so tests never depend on each other. They cover listing, pagination, the limit cap, search, starred and label filters, getting one email, user isolation, compose, updates, the delete rules, labels, the 404 route, and the production error handler.

## Project structure

```
mailbox/
  client/                     React app (Vite)
    src/api.js                the one fetch wrapper
    src/hooks/                useEmails, useDebounce
    src/components/           Layout, Sidebar, TopBar, EmailList, ComposeModal, ...
    src/pages/                MailboxPage, EmailPage
    vercel.json               SPA rewrite so /email/123 works on refresh
  server/
    src/app.js                builds the Express app (no listen, so tests can import it)
    src/server.js             starts the server
    src/db.js                 pg Pool
    src/routes/               emails, labels, me
    src/middleware/           currentUser, validate, errorHandler
    db/schema.sql             tables and constraints
    db/seed.js                drop, recreate and seed 100k emails
    scripts/benchmark-index.js
    tests/                    Jest + Supertest
  docs/benchmark.md           generated benchmark report
  docker-compose.yml          optional local Postgres 16
  INTERVIEW_NOTES.md
```

## Deployment

The order matters a little: the API needs the client's URL (for CORS) and the client needs the API's URL, so deploy the API first and come back to fill in the client URL.

### 1. Database: Neon

1. Create a project at [neon.tech](https://neon.tech). Pick a region close to where you'll run the API, e.g. **AWS US East 2 (Ohio)** to match Render's **Ohio** region. Every query crosses that gap, so it matters.
2. Open **Connect**, turn **Connection pooling off**, and copy the connection string. Change `sslmode=require` to `sslmode=verify-full` (same behaviour, and it silences a warning from `pg`).
3. For local tests, also create a second database called `mailbox_test` (**Databases → Add database**) and use its connection string as `DATABASE_URL_TEST`.
4. Fill the database from your own machine. Put the URL in `server/.env` as `DATABASE_URL`, then:
   ```bash
   npm --prefix server run db:reset
   npm --prefix server run benchmark
   ```
   `benchmark` is not optional here: it creates the index the inbox query needs.
5. If the password has ever been pasted anywhere public, click **Reset password** in the Connect dialog first and use the new connection string everywhere.

### 2. API: Render

1. Push the repo to GitHub.
2. On [render.com](https://render.com): **New → Web Service** and connect the repo.
3. Settings:
   | Setting | Value |
   |---|---|
   | Root Directory | `server` |
   | Runtime | Node |
   | Build Command | `npm ci --omit=dev` |
   | Start Command | `npm start` |
   | Region | Ohio (same as Neon) |
   | Instance Type | Free |
   | Health Check Path | `/api/health` |
4. Environment variables (Render sets `PORT` itself, and `server.js` reads it):
   | Key | Value |
   |---|---|
   | `DATABASE_URL` | your Neon connection string |
   | `DEMO_USER_ID` | `1` |
   | `NODE_ENV` | `production` |
   | `CLIENT_ORIGIN` | your Vercel URL, e.g. `https://mailbox-abc.vercel.app` (no trailing slash). Use a placeholder until step 3 is done. |
   | `NODE_VERSION` | `20` (or newer) |
5. Deploy, then open `https://YOUR-API.onrender.com/api/health`. You should see `{"status":"ok"}`.

The free tier sleeps after 15 minutes without requests, so the first request after a quiet spell can take around 30 seconds.

### 3. Client: Vercel

1. On [vercel.com](https://vercel.com): **Add New → Project** and import the repo.
2. Set **Root Directory** to `client`. Vercel detects Vite: build command `npm run build`, output directory `dist`.
3. Add the environment variable `VITE_API_URL` = `https://YOUR-API.onrender.com/api`. Vite bakes `VITE_*` variables into the bundle at build time, so if you change it later, **redeploy**.
4. Deploy. [client/vercel.json](client/vercel.json) rewrites every path to `index.html`. Without it, refreshing `/email/123` would ask Vercel for a file called `/email/123`, which doesn't exist, and you'd get a 404. With it, React Router loads and handles the URL. Real files like `/assets/index.js` are still served normally.
5. Go back to Render, set `CLIENT_ORIGIN` to the Vercel URL, and save (Render restarts the service). Until you do this, the browser blocks the API calls with a CORS error.

### Never commit secrets

`.env` files are in `.gitignore`. Only the `.env.example` files, which hold no real values, are committed.
