# Interview notes: Mailbox

My own notes for explaining this project. Short sentences, real file names, and the numbers I measured.

**Numbers to quote:** 10 REST endpoints · 29 passing API tests · 100,000 seeded emails across 50 users · inbox query 14.16 ms to 0.138 ms (about 103x faster) with a composite index.

---

## 1. What happens when I click an email

Say I'm on the inbox and click "Project kickoff" (id 2624).

**1. The click (React).**
Each row in [EmailList.jsx](client/src/components/EmailList.jsx) contains a React Router `<Link to="/email/2624">`. Clicking it does **not** reload the page. React Router stops the normal link behaviour, calls `history.pushState` to change the URL, and re-renders.

**2. Routing.**
[App.jsx](client/src/App.jsx) matches `email/:id` and renders `<EmailPage />` inside the `<Layout />`. The sidebar and top bar stay on screen because they belong to the layout. Only the `<Outlet />` area changes.

**3. The effect starts the request.**
[EmailPage.jsx](client/src/pages/EmailPage.jsx) reads `id` with `useParams()`. Its `useEffect` sets `loading = true` and calls `api('/emails/2624')`.

**4. The fetch wrapper.**
[api.js](client/src/api.js) builds the URL from `VITE_API_URL` and calls `fetch` with `Accept: application/json`. It only adds `Content-Type` when there's a body, so this GET is a CORS "simple request" with no preflight.

**5. The HTTP request.**
The browser sends `GET /api/emails/2624` over HTTP (HTTPS in production). It adds an `Origin: http://localhost:5173` header because the API is on a different origin (a different port counts).

**6. Express middleware, in order** ([app.js](server/src/app.js)):
1. `cors()` checks the origin against `CLIENT_ORIGIN`. If it matches, it adds `Access-Control-Allow-Origin` to the response.
2. `express.json()` parses JSON bodies (there isn't one on a GET).
3. `currentUser` sets `req.userId = 1` (the demo user).
4. The `/api/emails` router finds `GET /:id`.

**7. Validation.**
`validate({ params: idParams })` runs zod. `"2624"` is coerced to the number 2624 and checked to be a positive integer that fits in a Postgres `INTEGER`. `/emails/abc` would stop here with a **400**.

**8. SQL.**
`findOwnEmail` runs `SELECT * FROM emails WHERE id = $1 AND user_id = $2` with `[2624, 1]`:
- The `pg` Pool lends us an already-open connection, so there's no new TCP/TLS handshake.
- The SQL text and the values travel **separately** (Parse, then Bind).
- Postgres finds the row through the primary key index.
- A second query joins `email_labels` and `labels` to get the email's labels.

**9. The response.**
No row means a `404` error, which the central [errorHandler](server/src/middleware/errorHandler.js) turns into `{ "error": { "message": "Email not found" } }`. Otherwise `res.json({ ...email, labels })` sends **200** with JSON.

**10. Back in the browser.**
`fetch` resolves. `api.js` checks `response.ok` (fetch does **not** throw on 404 or 500, so we check ourselves), parses the JSON and returns it.

**11. State update and re-render.**
`setEmail(data)` and `setLoading(false)` make React re-render, and the article with the subject, labels and body appears.

**12. Marking it read.**
If the email was unread, the page sends `PATCH /api/emails/2624 { is_read: true }`:
- PATCH with a JSON body is not a "simple request", so the browser first sends an `OPTIONS` preflight, which `cors()` answers.
- After that, `refreshCounts()` re-fetches `/me` and `/labels`, and the sidebar badge drops by one.

**Details worth mentioning:**
- If I navigate away before the response arrives, an `ignore` flag in the effect's cleanup stops the old response from overwriting newer state.
- In development, React StrictMode runs effects twice, so you see two GETs. Production runs them once.

---

## 2. Key decisions and trade-offs

### Raw SQL instead of an ORM
- **Why:** I can see and explain every query, use Postgres features directly (`FILTER`, `EXISTS`, `ON CONFLICT DO NOTHING`, `EXPLAIN ANALYZE`), and tune them. The benchmark imports `buildListQuery` from the route, so it measures exactly the SQL the API runs.
- **Cost:** more boilerplate. I wrote the dynamic `WHERE` builder and the multi-row insert helper by hand. Renaming a column means finding every query. There are no generated types or migrations.
- **Safety rule I followed:** values are always `$1, $2` parameters. The only strings ever joined into SQL are fixed column names from an allow-list (the zod schema for PATCH) and placeholder numbers.

### Offset pagination instead of cursor pagination
- **What I used:** `LIMIT 20 OFFSET (page - 1) * 20`. It's simple, supports "page 7 of 104", and the URL can hold `?page=7`.
- **Where it breaks down:**
  - **Deep pages get slower.** Postgres still reads and throws away every skipped row, so page 1,000 reads 20,000 rows to return 20.
  - **Results shift.** If a new email arrives while I'm on page 1, everything moves down one place, so page 2 repeats one email. If an email is deleted, one gets skipped.
  - **Counting costs time.** `count(*)` for "of 2,075" runs on every request. That's fine for a few thousand rows and expensive for millions.
- **Cursor (keyset) pagination** says "give me 20 emails older than the last one I saw":
  ```sql
  WHERE user_id = $1 AND folder = $2 AND (created_at, id) < ($3, $4)
  ORDER BY created_at DESC, id DESC LIMIT 20
  ```
  With a matching index it's equally fast on every page and never repeats or skips rows. The cost is that you can't jump to page 50, and "x of total" needs a separate count. Gmail-style "older/newer" buttons suit it well.

### Soft delete via the trash folder
- "Delete" is just `PATCH { folder: 'trash' }`, so it's reversible. Permanent `DELETE` is only allowed when the email is already in trash; otherwise the API returns **409 Conflict**. That two-step design protects against accidental data loss.
- **Trade-offs:** trash grows forever (a real app would purge after 30 days with a scheduled job), and I don't remember the original folder, so a restore can't send an email back to Sent.

### One row per mailbox copy
- Sending an email inserts two rows: the sender's copy in `sent` and the recipient's copy in `inbox`, inside one transaction.
- Each person can read, star or trash their own copy, and every query is a simple `WHERE user_id = ...`.
- **Cost:** the body is stored twice. A larger system would split it into `messages` (the content, stored once) and `mailbox_entries` (user_id, message_id, folder, is_read, ...).

### Optimistic updates
- **How:** for star and read, the UI changes immediately and then sends the PATCH. On failure, it puts the old rows back and shows an error toast. I tested this by stopping the API.
- **Why:** the app feels instant, and the server agrees more than 99% of the time.
- **Risk:** for a moment the screen can show something the server rejected. I only use it for small, reversible changes. Moving to trash and deleting wait for the server, because they remove rows and the list has to refill.
- **Known gap:** if 3 of 5 bulk updates succeed and 2 fail, I roll back all 5 on screen. A refresh would show the real state.

### Why the index is `(user_id, folder, created_at DESC)`
- Think of a phone book sorted by last name, then first name. The index is sorted by `user_id`, then `folder`, then `created_at` (newest first).
- The query uses `=` on `user_id` and `folder`, so Postgres jumps straight to "user 1, inbox". Inside that block, entries are already newest-first, so it reads 20 and **stops**: no Sort step, and no reading the other 2,055 inbox rows or 97,925 other emails.
- **Rule:** equality columns first, then the sort or range column. With `(created_at, user_id, folder)` the user's emails would be scattered across the whole index.
- **Leftmost prefix:** the same index also helps queries on just `user_id`, or `user_id + folder`, but **not** a query on `folder` alone.
- **Cost of an index:** disk space, plus every INSERT and UPDATE of those columns must update it too. Only index what your queries actually use.
- **Measured:** median 14.16 ms to 0.138 ms over 5 runs; pages read went from 5,703 to 23 (see [docs/benchmark.md](docs/benchmark.md)).

### ILIKE instead of full-text search
- `subject ILIKE '%exam%'` is simple, case-insensitive and matches inside words. A normal B-tree index can't help with a leading `%`, though, so Postgres checks every one of the user's emails in that folder. For about 2,000 emails per folder that takes milliseconds.
- At scale I'd choose between two options:
  - **`pg_trgm` + a GIN index:** keeps `ILIKE` behaviour (substring match) but makes it indexable.
  - **Full-text search** (`tsvector` + GIN index + `to_tsquery`): matches whole words with stemming (so "meeting" finds "meetings") and can rank results by relevance, but won't match fragments like "kick" in "kickoff".
- I also escape `%` and `_` in the search term, so searching "50%" means a literal percent sign.

### Smaller choices
- **`app.js` vs `server.js`:** the app is built without `listen()`, so Supertest can send requests straight into it.
- **zod on the server, simple checks on the client:** client validation is for user experience only. The server must never trust the client.
- **The URL holds state** (`?page=2&q=exam`): refresh, the back button and shared links all work.
- **No Redux:** each view owns its data (`useEmails`). The few shared things (counts, toasts, compose) live in `Layout` and pass down through `<Outlet context>`.
- **Native `<dialog>` for compose:** `showModal()` provides the backdrop, keeps focus inside, closes on Esc and returns focus to the button.
- **Tests hit a real Postgres, not mocks,** reset before every test and run in band (one file at a time, so they don't reset the same database at the same moment).

---

## 3. Security

### SQL injection
- **The attack:** if I built SQL with string concatenation, `"SELECT * FROM emails WHERE subject = '" + q + "'"`, then typing `' OR 1=1 --` would change the query itself and return everyone's email.
- **The fix:** parameterized queries. The SQL text has placeholders (`$1`), and the values travel separately. Postgres parses the SQL **before** it sees the values, so a value can never become SQL code.
- **Proof:** a test searches for `' OR 1=1 --` and gets **0 results**.
- **Dynamic SQL:** the only dynamic pieces are column names (only `is_read`, `is_starred` or `folder` can pass the zod schema) and placeholder numbers.

### User isolation (stopping IDOR)
- IDOR (insecure direct object reference) means changing `/emails/5` to `/emails/6` and seeing someone else's data.
- Every query includes `AND user_id = $n` with `req.userId`, which comes from the server and never from the request.
- Someone else's email returns **404**, the same as a missing one, so an attacker can't even learn which ids exist. A 403 would confirm it exists.
- Adding a label checks that **both** the email and the label are mine.
- **Proof:** tests show that GET and PATCH on another user's email return 404 and change nothing. I also broke the query on purpose (`OR` instead of `AND`) and watched that test fail.

### CORS
- **What it is:** browsers block a page on one origin from reading responses from another origin, unless the server allows it. The API allows exactly one origin, `CLIENT_ORIGIN`.
- **What it isn't:** authentication. `curl` or a server ignores CORS completely. It protects users' browsers from other websites reading the API with their cookies. It doesn't protect the API itself.

### Input validation
- Every param, query string and body is checked with zod in one reusable middleware. Bad input gets a **400** with field-level details before any SQL runs.
- Limits: subject ≤ 200 characters, body ≤ 10,000 characters, search ≤ 100 characters, page size capped at 50, ids must fit a Postgres integer, and JSON bodies ≤ 100 kB (Express's default).

### Errors and XSS
- In production, a 500 says only "Internal server error". No stack traces or database messages leak, and there's a test for this.
- Email bodies are rendered as text, and React escapes them. I never use `dangerouslySetInnerHTML`, so `<script>` in an email is shown, not run.

### What I'd add for real authentication
1. **Sign up:** add `password_hash` to `users`. On sign-up, hash the password with **bcrypt** (cost about 12). Bcrypt is slow on purpose, so stolen hashes are expensive to crack, and it salts each hash automatically.
2. **Log in:** compare with `bcrypt.compare`. On success, sign a **JWT** (`{ userId }`, expires in about 1 hour) with a secret from the environment.
3. **Store the JWT in a cookie:** `httpOnly`, so JavaScript can't read it and an XSS bug can't steal it; `Secure`, so it's HTTPS only; and `SameSite`. Don't use localStorage.
4. **Replace `currentUser`:** read the cookie, verify the JWT, set `req.userId`, and return 401 if it's missing or invalid. No route needs to change.
5. **Allow cookies across origins:** CORS needs `credentials: true` with the exact origin, and `fetch` needs `credentials: 'include'`.
6. **Handle different domains:** Vercel and Render are different sites, so the cookie needs `SameSite=None; Secure`, or better, proxy `/api` through a Vercel rewrite so it's same-site and `SameSite=Lax` works.
7. **Extras:** rate-limit the login endpoint against password guessing, check the `Origin` header on writes against CSRF, and add security headers (e.g. `helmet`).

---

## 4. Fifteen likely questions

**1. Walk me through the architecture.**
A React app on Vercel calls a REST API on Render over HTTPS with JSON. The API is Express. Each request passes through CORS, JSON parsing, a current-user middleware, zod validation, the route handler and a central error handler. Route handlers run parameterized SQL against Postgres on Neon through a connection pool.

**2. Why REST, and what makes your API RESTful?**
Resources are nouns (`/emails`, `/emails/:id`, `/labels`), and HTTP methods are the verbs: GET reads, POST creates, PATCH partially updates, DELETE removes. It's stateless, because each request carries everything needed, and it uses the right status codes: 201 Created, 204 No Content, 400, 404, 409.

**3. PATCH vs PUT?**
PUT replaces the whole resource, so you send every field. PATCH changes only the fields you send. I use PATCH because the client usually changes one thing, like `is_starred`.

**4. Why 409 for deleting an email that isn't in trash?**
The request is well-formed (so not 400) and the email exists (so not 404), but it conflicts with the email's current state. 409 Conflict says exactly that.

**5. Why 404 instead of 403 for another user's email?**
A 403 would confirm the email exists. A 404 reveals nothing. From the user's point of view it doesn't exist.

**6. How do you prevent SQL injection?**
Parameterized queries everywhere. Values are sent separately from the SQL text, so they're never parsed as SQL. Dynamic column names come only from an allow-list. A test sends `' OR 1=1 --` and gets 0 rows.

**7. Explain your database schema.**
Four tables: `users`; `emails` (each row is one copy in one user's mailbox, with a foreign key to `users` and `ON DELETE CASCADE`, and a CHECK constraint keeping `folder` to inbox/sent/trash); `labels` (unique per user and name); and `email_labels`, a join table for the many-to-many link, with a composite primary key so the same label can't be added twice.

**8. What is an index and how did you choose yours?**
A sorted structure (a B-tree) that lets Postgres find rows without reading the whole table. I put the equality columns first and the sort column last, so the inbox query reads 20 rows in order and stops. It went from 14.16 ms to 0.138 ms (about 103x faster), and the plan changed from a Seq Scan plus Sort to an Index Scan.

**9. How did you measure it?**
`EXPLAIN (ANALYZE, BUFFERS)` really runs the query and reports Postgres's own execution time and the pages it read. I took the median of 5 runs before and after, ran `ANALYZE` first so statistics were fresh, and benchmarked the exact SQL the API builds.

**10. Offset or cursor pagination, and when does offset fail?**
I used offset, because it's simple and allows page numbers. It gets slower on deep pages, since skipped rows are still read, and rows shift when new mail arrives. Cursor pagination fixes both, but you can't jump to a page.

**11. What is an optimistic update? What if the server fails?**
Update the UI first, then send the request. If it fails, restore the old values and show an error. I use it only for small, reversible actions like star and read.

**12. How does your search work, and why debounce it?**
The input waits 300 ms after the last keystroke, then writes `?q=` into the URL. The page reads the URL and fetches. Typing "synergy" sends 1 request instead of 7. The server uses `ILIKE` with a parameter. For large data I'd use full-text search or a trigram index.

**13. How do you test the API?**
29 Jest + Supertest tests send real HTTP requests to the Express app (no port needed, because `app.js` doesn't call `listen`). They run against a separate test database that is rebuilt from fixed fixtures before every test. They check status codes, response bodies and, where needed, the database directly.

**14. How does CORS work, and is it security?**
The browser sends an `Origin` header, and the server replies with `Access-Control-Allow-Origin`. For non-simple requests (like PATCH with JSON) the browser sends an OPTIONS preflight first. It protects users in browsers. It is not authentication, because curl ignores it.

**15. How would you add real login?**
Store a bcrypt hash of the password. On login, issue a short-lived JWT in an httpOnly, Secure, SameSite cookie. Change the one `currentUser` middleware to verify it and set `req.userId`. Every route already filters by `req.userId`, so nothing else changes.

---

## 5. What I'd improve with more time

- **Real authentication**, as described above: sign-up, login, bcrypt, JWT in an httpOnly cookie, and rate limiting.
- **Cursor pagination** with a tie-breaker. Today's sort is only `created_at`, so two emails with the same timestamp could swap places between pages. I'd sort by `(created_at DESC, id DESC)` and add `id` to the index.
- **Bulk endpoint** (`PATCH /emails` with a list of ids): one request and one SQL `UPDATE ... WHERE id = ANY($1)` instead of one request per email.
- **Faster search:** a `pg_trgm` GIN index or full-text search.
- **Restore from trash** to the original folder, plus auto-purging trash after 30 days.
- **Label management in the UI:** the API can already add and remove labels on an email; the UI only shows them.
- **Frontend tests** with React Testing Library (optimistic rollback, compose validation), plus an end-to-end test with Playwright.
- **Migrations** (e.g. node-pg-migrate) instead of drop-and-recreate, so production data survives schema changes.
- **Caching** the counts, or skipping `count(*)` on very large folders.
- **Observability:** request logging, error tracking, and a `/health` check that also pings the database.
