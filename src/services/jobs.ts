import analytics from './analytics';
import database from './database';
import email from './email';

type DailyJobOptions = {
  policy?: {
    serviceLevel?: number;
    leadTimeDays?: number;
    maxChangePercent?: number;
    roundToPack?: number | null;
    minSafetyStock?: number;
  };
  warehouses?: string[]; // limit to specific warehouse IDs
};

export async function runDailySafetyStockAndEmail(options: DailyJobOptions = {}) {
  const startedAt = new Date();
  const policy = {
    serviceLevel: Number(process.env.SS_SERVICE_LEVEL || options.policy?.serviceLevel || 0.95),
    leadTimeDays: Number(process.env.SS_LEAD_TIME_DAYS || options.policy?.leadTimeDays || 7),
    maxChangePercent: Number(process.env.SS_MAX_CHANGE_PERCENT || options.policy?.maxChangePercent || 20),
    roundToPack: process.env.SS_ROUND_TO_PACK ? Number(process.env.SS_ROUND_TO_PACK) : (options.policy?.roundToPack ?? null),
    minSafetyStock: Number(process.env.SS_MIN_SAFETY_STOCK || options.policy?.minSafetyStock || 0)
  };

  const allWarehouses = await database.getWarehouses();
  const targetWarehouses = allWarehouses
    .filter(w => w.isActive)
    .filter(w => !options.warehouses || options.warehouses.includes(w.warehouseId));

  const adjustments = [] as Awaited<ReturnType<typeof analytics.autoAdjustSafetyStock>>[];
  for (const wh of targetWarehouses) {
    try {
      const result = await analytics.autoAdjustSafetyStock(wh.warehouseId, policy);
      adjustments.push(result);
    } catch (err) {
      console.error(`Auto-adjust failed for ${wh.name} (${wh.warehouseId}):`, err);
    }
  }

  // Generate executive summary for the email body
  let summary: Awaited<ReturnType<typeof analytics.generateExecutiveSummary>> | null = null;
  try {
    summary = await analytics.generateExecutiveSummary();
  } catch (err) {
    console.warn('Failed to generate executive summary for email:', err);
  }

  // Aggregate adjustment stats
  const totalCandidates = adjustments.reduce((s, a) => s + a.totalCandidates, 0);
  const totalApplied = adjustments.reduce((s, a) => s + a.appliedCount, 0);

  // Build email content
  const dateStr = startedAt.toISOString().slice(0, 10);
  const subject = `Daily Inventory Report ${dateStr} — Safety Stock updated: ${totalApplied}/${totalCandidates}`;

  const changesHtmlRows = adjustments.flatMap(a => a.changes.map(c => (
    `<tr>
      <td>${c.warehouseName}</td>
      <td>${c.productName}</td>
      <td style="text-align:right">${c.currentSafetyStock}</td>
      <td style="text-align:right">${c.recommendedSafetyStock}</td>
      <td style="text-align:right">${c.changePercent.toFixed(1)}%</td>
      <td>${c.reason}</td>
    </tr>`
  ))).join('');

  const changesSection = totalApplied > 0 ? `
    <h3>Safety Stock Adjustments</h3>
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;font-size:13px;">
      <thead>
        <tr>
          <th>Warehouse</th>
          <th>Product</th>
          <th>Current</th>
          <th>New</th>
          <th>Δ %</th>
          <th>Reason</th>
        </tr>
      </thead>
      <tbody>
        ${changesHtmlRows}
      </tbody>
    </table>
  ` : '<p>No safety stock changes applied today.</p>';

  const overviewSection = summary ? `
    <h3>Overview</h3>
    <p><strong>Total Inventory Value:</strong> Rp ${summary.metrics.totalInventoryValue.toLocaleString('id-ID')}<br/>
    <strong>Products Below Safety Stock:</strong> ${summary.metrics.productsBelowSafetyStock}<br/>
    <strong>Pending PO Value:</strong> Rp ${summary.metrics.pendingPOValue.toLocaleString('id-ID')}</p>
  ` : '';

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#111">
      <h2>Daily Inventory Report — ${dateStr}</h2>
      <p><strong>Safety Stock:</strong> applied ${totalApplied} of ${totalCandidates} candidates across ${targetWarehouses.length} warehouses.</p>
      ${overviewSection}
      ${changesSection}
    </div>
  `;

  const text = `Daily Inventory Report — ${dateStr}\n` +
    `Safety Stock: applied ${totalApplied} of ${totalCandidates} candidates across ${targetWarehouses.length} warehouses.\n` +
    (summary ? `Total Inventory Value: Rp ${summary.metrics.totalInventoryValue.toLocaleString('id-ID')}\n` : '') +
    (summary ? `Products Below Safety Stock: ${summary.metrics.productsBelowSafetyStock}\n` : '');

  // Send email if enabled
  let emailInfo: any = null;
  const recipients = (process.env.EMAIL_TO || '').split(',').map(s => s.trim()).filter(Boolean);
  if (recipients.length && email.isEnabled()) {
    try {
      emailInfo = await email.sendEmail({ to: recipients, subject, html, text });
    } catch (err) {
      console.error('Failed to send email:', err);
    }
  } else {
    console.warn('Skipping email send: EMAIL_TO missing or email disabled');
  }

  const finishedAt = new Date();
  return {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationSeconds: Math.round((finishedAt.getTime() - startedAt.getTime()) / 1000),
    policy,
    warehouses: targetWarehouses.map(w => ({ id: w.warehouseId, name: w.name })),
    safetyStock: {
      totalCandidates,
      totalApplied,
      perWarehouse: adjustments.map(a => ({ warehouseId: a.warehouseId, applied: a.appliedCount, candidates: a.totalCandidates }))
    },
    email: {
      attempted: recipients.length > 0 && email.isEnabled(),
      to: recipients,
      messageId: emailInfo?.messageId || null
    }
  };
}

