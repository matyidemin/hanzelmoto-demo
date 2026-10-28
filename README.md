# Browser preview on GitHub Pages

This repository contains an unofficial design demonstration for HANZELMOTO and the separate Node/SQLite application source. The public preview is not the business's official reservation system. Use fictional details only; demo data stays in the browser. No email or SMS is sent.

## Free hosted demo

In repository Settings → Pages, choose Deploy from a branch, branch main, folder /docs, then Save. GitHub publishes docs/index.html at the Pages URL shown there. The preview is self-contained and supports repository subpaths. Its illustrative photo requires internet access. Demo administrator password: ukazka-hanzelmoto. This password only gates a device-local demonstration, not private data.

GitHub Pages hosts only the static demonstration. To process real appointments across devices, deploy the Node server and persistent database separately following the application guide below.

The uploaded repository excludes databases, .env files, credentials and the separate Sites hosting identity.

---

# HANZELMOTO — booking and annual care

A responsive Slovak service website, interactive sales demonstration, and working Node.js/SQLite application. The two modes share the interface but deliberately have different storage and security models.

## Start the real application

Requires Node.js 24 or newer. No package downloads or third-party runtime dependencies.

1. Copy `.env.example` to `.env`.
2. Set a unique `ADMIN_PASSWORD` of at least 16 characters. There is no default production password.
3. Run `node --env-file-if-exists=.env server.mjs` from this folder.
4. Open `http://localhost:3000`; administration is `http://localhost:3000/#admin`.
5. Run checks with `node --test test/app.test.mjs`.

The SQLite database is created under `data/`, outside the public directory. Stop the process with Ctrl+C. The test suite uses an isolated temporary database and never contacts a mail provider.

## Hosted sales demonstration versus server

The accompanying Sites publication hosts `public/` as a **private static demonstration**, not the Node server. It shows a persistent demo banner and uses `public/demo.js` and localStorage. Fictional customers use example.com addresses. Demo administrator password: `ukazka-hanzelmoto`. This is an interaction aid, not a security boundary. All demo records are visible on that device. Use only invented data. Reset clears the demo store.

The real server returns a different `/runtime.js` (`HM_DEMO=false`), uses SQLite and password-protected administration, and never loads the demo data module. Do not deploy `public/` alone expecting a real booking system. The demo's password is not accepted by the real server unless you intentionally set it, and is too short to satisfy production configuration.

## What works

- Four configurable services with durations, notes, customer details and validation.
- Availability in Europe/Bratislava, weekday hours, 24-hour lead time, 90-day horizon, half-hour steps and one shared workshop resource.
- SQLite `BEGIN IMMEDIATE` transaction and unique `(date, minute)` occupancy prevent overlapping requests across service durations. The first request holds the full window; a competing request receives HTTP 409.
- Pending → confirmed → completed, or pending/confirmed → cancelled. Cancelling releases occupancy. Completed records keep historical occupancy. Same-day blocking refuses days containing reservations. Rebooking after cancellation is supported; rescheduling currently means cancelling and creating a new request.
- Calendar download is marked tentative; workshop confirmation is separate.
- Reminder signup alongside booking or independently. Unchecked, optional consent; versioned consent text and timestamps; seven-day, one-use confirmation token; revocation and suppression of queued annual messages.
- Baseline due date is twelve months after requested appointment (or signup for standalone registrations). Completing a service updates active subscribers to twelve months after that visit. Repeat booking does not silently re-enable revoked consent.
- Admin booking search/status filters, upcoming schedule, closures, subscriber evidence, outbox previews, audit history and launch configuration checklist.
- Booking receipt and admin status changes create transactional outbox messages. No SMS provider is present.
- Admin authentication: scrypt-derived password comparison, HttpOnly/SameSite cookie, 8-hour in-memory session, CSRF token, same-origin mutation checks, JSON-only requests, request size cap and in-process rate limits.

## Email and scheduled jobs

**Default is outbox-only. No email or SMS is sent.** The UI makes this explicit. Outbox messages may contain private cancellation/consent links; restrict administrator access and database/backups accordingly.

Run `node --env-file-if-exists=.env jobs.mjs` hourly with your host scheduler, using the project folder as the working directory and the same persistent database path. This queues due annual reminders, advances the next due date and attempts queued deliveries only when a relay is configured. Repeated runs do not duplicate a yearly reminder. Admin can run each stage manually.

Optional relay configuration:

```
MAIL_RELAY_URL=https://your-owned-mail-relay.example/send
MAIL_RELAY_TOKEN=your-secret-token
```

The adapter posts JSON `{id,to,subject,text}`, `Authorization: Bearer …`, and `Idempotency-Key: <outbox id>`. The relay must validate authentication, enforce recipient/content limits and deduplicate that key. A 2xx response means accepted by the relay; the app records `sent`. This does **not** prove inbox delivery. Non-2xx/network errors remain queued; at most five attempts, then admin intervention. There is no exponential backoff or delivery/bounce webhook implementation. One job runner at a time is recommended; relay deduplication is required to protect concurrent/manual retries. Configure verified sender, SPF/DKIM/DMARC, unsubscribe handling and bounce suppression at the relay. The adapter is provided but no external delivery has been integrated or tested.

Every annual reminder contains an unsubscribe URL; opening it displays a confirmation button (safe from automatic email link scanning). Revocation suppresses queued mail for that subscriber. Transactional booking messages are distinct from annual reminders. No general marketing consent or newsletter list is collected.

## Production deployment

Use a single Node.js 24 instance on a VM or container host with a persistent disk. This is not an ephemeral/serverless database deployment and not a Cloudflare Worker app.

1. Copy the app to your host, excluding `.env`, local `data/`, `.git` and development archives. Create `.env` securely on the host.
2. Set `PUBLIC_URL=https://your-final-domain`, `COOKIE_SECURE=true`, `ADMIN_PASSWORD`, and an absolute `DB_PATH` on the persistent volume. Bind `HOST=0.0.0.0` inside a private container network; otherwise retain loopback behind a reverse proxy.
3. Terminate TLS with Caddy/nginx or the host. Proxy to port 3000. Set the exact canonical public origin; cross-origin submissions are refused. Do not cache `/api/*` or `/runtime.js`.
4. Keep one app instance and one job runner. Sessions and abuse limits are in memory. Restart logs administrators out. Behind a proxy, request limits currently apply to the proxy IP; configure per-client edge limits as well. Add managed identity/MFA before granting access to multiple employees. There are no staff roles or granular permissions.
5. Back up SQLite with its online backup API or stop app/jobs before copying the database. Do not copy a live `.sqlite` alone while WAL is active. Encrypt backups, restrict file permissions, monitor disk usage, test restore and define retention.
6. Schedule hourly `jobs.mjs` and monitor queued/failed outbox messages. Approve the retention policy and implement scheduled deletion before collecting personal data at scale. A manual data rights helper is supplied below.
7. Verify the complete launch checklist in `LAUNCH.md` before opening the site to customers.

The included Dockerfile and Compose file provide a persistent single-container starting point. An HTTPS reverse proxy and scheduler are still required. Do not expose the admin application over plain HTTP on the public Internet.

## Data rights and retention

`node --env-file-if-exists=.env data-ops.mjs export person@example.com` writes an export to stdout for a verified data subject. Redirect it only to secure temporary storage; do not send it without identity checks.

`node --env-file-if-exists=.env data-ops.mjs erase person@example.com --confirm` removes that email's bookings/slots, subscriptions and outbox records from the application database. Cancels their appointments by removing them; coordinate with the workshop first. It preserves anonymous audit references. Make and verify a backup first and apply the approved backup expiry policy. Accounting records and separate providers require separate handling.

`node --env-file-if-exists=.env data-ops.mjs expired-consents --confirm` removes unconfirmed consent records older than seven days and their outbox messages. It does not delete booking records or implement the full proposed retention plan. No automatic legal retention period is assumed.

## Configuration and evidence

Business contact fields and service capacity are in `config.mjs`. Static demonstration equivalents live in `public/demo.js`; update both if changing the sales preview. All prices are “by agreement”; no invented ratings, testimonials, certifications or service guarantees appear.

Verified 28 October 2026 from the [Benelli dealer network](https://www.benelli-motor.cz/sit-dealeru): HANZELMOTO s.r.o., Dunajské nábrežie 1179/39, 945 05 Komárno, +421 908 797 600, hanzelmoto@gmail.com, hanzelmoto.eu. The [Benda dealer network](https://www.benda-motor.cz/sit-dealeru) corroborates the contact details. The original hanzelmoto.eu site could not be fetched during research. Public opening-hour listings conflict, so no opening hours are represented as verified. The proposed availability schedule and service durations require owner approval.

Consent design follows the [European Commission consent guidance](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/legal-grounds-processing-data_en) and [EDPB Guidelines 05/2020](https://www.edpb.europa.eu/documents/guideline/guidelines-052020-on-consent-under-regulation-2016679_en). The embedded Slovak privacy text is a marked draft, not a completed legal compliance assessment. Finalize controller identity/IČO, processors, cross-border transfers, rights procedure and retention with the owner.

The hero is an explicitly illustrative remote Unsplash motorcycle photograph, not a photo of this business. Replace it with an owned/licensed local photograph before launch and update the CSP/static file allowlist as needed. No analytics or advertising scripts. Slovak is implemented; Hungarian is an optional future translation, not a nonfunctional language switch.

## Validation

Integration test covers competing bookings, whole-duration occupancy, cancellation/release, closures, illegal status transitions, unauthenticated admin access, CSRF/origin checks, double opt-in/replay, yearly queue idempotency, unsubscribe suppression, outbox-only operation, DST conversion and leap-year rollover. Local browser QA verified the responsive customer layout and a fictional booking with optional consent. No real email, SMS, payments, calendar synchronization or customer account authentication was tested or claimed.
