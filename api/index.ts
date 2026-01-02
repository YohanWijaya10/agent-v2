import type { VercelRequest, VercelResponse } from '@vercel/node';
import app from '../src/index';

// Delegate all requests to the Express app
export default function handler(req: VercelRequest, res: VercelResponse) {
  // Express app is a request handler: (req, res) => void
  return (app as unknown as (req: any, res: any) => void)(req, res);
}

