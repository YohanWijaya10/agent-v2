import type { VercelRequest, VercelResponse } from '@vercel/node';
import { runDailySafetyStockAndEmail } from '../src/services/jobs';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Optional simple auth for cron
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided = (req.headers['x-cron-secret'] as string) || (req.query.token as string) || '';
    if (provided !== secret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const report = await runDailySafetyStockAndEmail();
    return res.status(200).json({ ok: true, report });
  } catch (err: any) {
    console.error('Cron job failed:', err);
    return res.status(500).json({ ok: false, error: err?.message || 'Cron job failed' });
  }
}

