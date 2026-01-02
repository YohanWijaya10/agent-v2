import express, { Request, Response } from 'express';
import analytics from '../services/analytics';
import deepseek from '../services/deepseek';

const router = express.Router();

// Cache for executive summary (5-minute TTL)
let summaryCache: { data: any; timestamp: number } | null = null;

// Get all dashboard metrics
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    const metrics = await analytics.getDashboardMetrics();
    res.json(metrics);
  } catch (error: any) {
    console.error('Error fetching dashboard metrics:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard metrics', message: error.message });
  }
});

// Get inventory value by category (for pie chart)
router.get('/inventory-value', async (req: Request, res: Response) => {
  try {
    const data = await analytics.getInventoryValueByCategory();
    res.json(data);
  } catch (error: any) {
    console.error('Error fetching inventory value by category:', error);
    res.status(500).json({ error: 'Failed to fetch inventory value data', message: error.message });
  }
});

// Get stock movement trend (for line chart)
router.get('/stock-movement', async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const data = await analytics.getStockMovementTrend(days);
    res.json(data);
  } catch (error: any) {
    console.error('Error fetching stock movement trend:', error);
    res.status(500).json({ error: 'Failed to fetch stock movement data', message: error.message });
  }
});

// Get top products by value (for bar chart)
router.get('/top-products', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const data = await analytics.getTopProductsByValue(limit);
    res.json(data);
  } catch (error: any) {
    console.error('Error fetching top products:', error);
    res.status(500).json({ error: 'Failed to fetch top products data', message: error.message });
  }
});

// Get warehouse distribution (for stacked bar chart)
router.get('/warehouse-dist', async (req: Request, res: Response) => {
  try {
    const data = await analytics.getWarehouseDistribution();
    res.json(data);
  } catch (error: any) {
    console.error('Error fetching warehouse distribution:', error);
    res.status(500).json({ error: 'Failed to fetch warehouse distribution data', message: error.message });
  }
});

// Get stock health status (for gauge)
router.get('/stock-health', async (req: Request, res: Response) => {
  try {
    const data = await analytics.getStockHealthStatus();
    res.json(data);
  } catch (error: any) {
    console.error('Error fetching stock health:', error);
    res.status(500).json({ error: 'Failed to fetch stock health data', message: error.message });
  }
});

// Get upcoming purchase orders (for timeline)
router.get('/upcoming-po', async (req: Request, res: Response) => {
  try {
    const data = await analytics.getUpcomingPOs();
    res.json(data);
  } catch (error: any) {
    console.error('Error fetching upcoming POs:', error);
    res.status(500).json({ error: 'Failed to fetch upcoming PO data', message: error.message });
  }
});

// Get AI-generated executive summary
router.get('/executive-summary', async (req: Request, res: Response) => {
  try {
    // Check cache (5-minute TTL)
    const now = Date.now();
    if (summaryCache && now - summaryCache.timestamp < 300000) {
      return res.json(summaryCache.data);
    }

    // Gather summary data
    const summaryData = await analytics.generateExecutiveSummary();

    // Build prompt for AI
    const prompt = `Buatlah ringkasan eksekutif inventory dalam format PARAGRAF (bukan bullet points).

Data Inventory Saat Ini:
- Total Inventory Value: Rp ${summaryData.metrics.totalInventoryValue.toLocaleString('id-ID')}
- Active Products: ${summaryData.metrics.totalActiveProducts}
- Products Below Safety Stock: ${summaryData.metrics.productsBelowSafetyStock}
- Pending PO Value: Rp ${summaryData.metrics.pendingPOValue.toLocaleString('id-ID')}
- Stock Health: ${JSON.stringify(summaryData.stockHealth)}
- Slow-Moving Items (90 days): ${summaryData.slowMovingCount}
- Upcoming PO Count: ${summaryData.upcomingPOs.length}
- Top 3 Urgent Reorders: ${JSON.stringify(summaryData.recommendations.slice(0, 3).map(r => ({
    product: r.productName,
    urgency: r.urgency,
    reorderPoint: r.reorderPoint,
    currentQty: r.currentQty
  })))}

Format yang diharapkan:
- 3-4 paragraf deskriptif yang mengalir
- Paragraf 1: Status finansial dan kesehatan inventory secara keseluruhan
- Paragraf 2: Kondisi stok (critical, warning, slow-moving)
- Paragraf 3: Tindakan segera yang diperlukan (urgent reorders)
- Paragraf 4 (opsional): Insight dan rekomendasi AI

Gunakan bahasa Indonesia profesional yang mudah dipahami. Berikan angka dalam format Rupiah. Fokus pada actionable insights.`;

    // Generate AI summary
    const aiResponse = await deepseek.chat(prompt, []);

    // Cache the result
    const responseData = {
      summary: aiResponse.response,
      generatedAt: new Date().toISOString()
    };

    summaryCache = {
      data: responseData,
      timestamp: now
    };

    res.json(responseData);
  } catch (error: any) {
    console.error('Error generating executive summary:', error);
    res.status(500).json({
      error: 'Failed to generate summary',
      message: error.message
    });
  }
});

export default router;
