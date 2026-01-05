# Inventory Dashboard Backend

Cron and Email
- Scheduled endpoint: `/api/cron` (Vercel Cron triggers this daily at 02:00 UTC by default; see `vercel.json`).
- The cron job auto-adjusts Safety Stock per active warehouse and emails a daily summary.

Environment
- SMTP: set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`, `EMAIL_FROM`, `EMAIL_TO`.
- Optional: `CRON_SECRET` to protect the endpoint (send header `x-cron-secret`).
- Safety Stock policy overrides: `SS_SERVICE_LEVEL`, `SS_LEAD_TIME_DAYS`, `SS_MAX_CHANGE_PERCENT`, `SS_ROUND_TO_PACK`, `SS_MIN_SAFETY_STOCK`.

Local Testing
- Run `npm run dev` to start API.
- Call `GET /api/cron` locally to simulate the job. If `CRON_SECRET` is set, include it.
