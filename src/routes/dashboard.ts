import express, { Request, Response } from 'express';
import analytics from '../services/analytics';

const router = express.Router();

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

export default router;
