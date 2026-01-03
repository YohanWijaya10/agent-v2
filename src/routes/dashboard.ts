import express, { Request, Response } from 'express';
import analytics from '../services/analytics';
import deepseek from '../services/deepseek';
import {
  ProductHealthDetail,
  StockHealthDetailsResponse,
  ProductPerformanceResponse,
  ProductPerformanceInsightResponse,
  ProductCategory
} from '../types';

const router = express.Router();

// Cache for executive summary (5-minute TTL)
let summaryCache: { data: any; timestamp: number } | null = null;

// Cache for stock health details (5-minute TTL)
let stockHealthDetailsCache: {
  data: any;
  timestamp: number;
  warehouseFilter?: string
} | null = null;

// Cache for product performance (5-minute TTL)
let performanceCache: {
  data: any;
  timestamp: number;
  warehouseFilter?: string;
  categoryFilter?: string;
} | null = null;

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
    const prompt = `Buatlah ringkasan eksekutif inventory dalam format MARKDOWN dengan struktur yang jelas.

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

FORMAT WAJIB (gunakan Markdown):
### 📊 Status Finansial & Kesehatan Inventory
[Paragraf deskriptif tentang kondisi finansial dan kesehatan inventory. Gunakan **bold** untuk highlight angka penting]

### ⚠️ Kondisi Stok & Perhatian Khusus
[Paragraf tentang critical items, warning, slow-moving. Gunakan **bold** untuk produk/angka yang butuh perhatian]

### 🎯 Tindakan Segera Diperlukan
[Paragraf tentang urgent reorders dan action items. Gunakan **bold** untuk urgency dan nama produk]

### 💡 Insight & Rekomendasi
[Paragraf insight AI dan rekomendasi strategis. Gunakan **bold** untuk highlight key points]

PENTING:
- Gunakan heading ### untuk setiap section
- Gunakan **bold** untuk highlight angka, nama produk, dan key points
- Tulis dalam bahasa Indonesia profesional
- Berikan angka dalam format Rupiah yang jelas
- Fokus pada actionable insights
- Jangan gunakan bullet points, hanya paragraf yang mengalir`;

    // Generate AI summary (text-only, no function calling for speed)
    const systemMessage = 'Anda adalah AI Assistant untuk ringkasan eksekutif inventory management. Berikan analisis yang profesional, actionable, dan mudah dipahami dalam Bahasa Indonesia.';
    const summaryText = await deepseek.generateTextOnly(prompt, systemMessage);

    // Cache the result
    const responseData = {
      summary: summaryText,
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

// Helper function for AI insight generation
async function generateProductHealthInsight(product: ProductHealthDetail): Promise<string> {
  const deficit = product.status === 'Critical'
    ? product.safetyStock - product.qtyOnHand
    : product.reorderPoint - product.qtyOnHand;

  const percentageOfThreshold = product.status === 'Critical'
    ? (product.qtyOnHand / product.safetyStock) * 100
    : (product.qtyOnHand / product.reorderPoint) * 100;

  const prompt = `Analisis stok untuk produk berikut:

Produk: ${product.productName}
Gudang: ${product.warehouseName}
Status: ${product.status}
Stok saat ini: ${product.qtyOnHand} unit
Safety stock: ${product.safetyStock} unit
Reorder point: ${product.reorderPoint} unit
Kekurangan: ${deficit} unit (${percentageOfThreshold.toFixed(1)}% dari target)

Berikan insight dalam 2-3 kalimat yang menjelaskan:
1. Mengapa status ini ${product.status.toLowerCase()} dan seberapa urgent
2. Dampak bisnis jika tidak ditindaklanjuti
3. Tindakan spesifik yang harus diambil segera

Format: Tulis dalam Bahasa Indonesia profesional, langsung to the point, tanpa prefix "Insight:" atau sejenisnya.`;

  const systemMessage = 'Anda adalah AI analyst untuk inventory management. Berikan insight yang actionable, spesifik, dan mudah dipahami dalam Bahasa Indonesia.';

  try {
    return await deepseek.generateTextOnly(prompt, systemMessage);
  } catch (error) {
    console.error(`Failed to generate insight for ${product.productName}:`, error);
    return `Produk ini dalam status ${product.status} dengan ${deficit} unit kekurangan dari target. Segera lakukan reorder untuk menghindari stockout.`;
  }
}

// Get stock health details with AI insights
router.get('/stock-health-details', async (req: Request, res: Response) => {
  try {
    const warehouseId = req.query.warehouseId as string | undefined;
    const now = Date.now();

    // Check cache (5-minute TTL, match warehouse filter)
    if (
      stockHealthDetailsCache &&
      now - stockHealthDetailsCache.timestamp < 300000 &&
      stockHealthDetailsCache.warehouseFilter === warehouseId
    ) {
      return res.json(stockHealthDetailsCache.data);
    }

    // Fetch stock health details
    const details = await analytics.getStockHealthDetails(warehouseId, 10);

    // Generate AI insights in parallel
    const allProducts = [...details.critical, ...details.warning];

    const productsWithInsights = await Promise.all(
      allProducts.map(async (product) => {
        const insight = await generateProductHealthInsight(product);
        return { ...product, insight };
      })
    );

    // Split back into critical and warning
    const criticalWithInsights = productsWithInsights.filter(p => p.status === 'Critical');
    const warningWithInsights = productsWithInsights.filter(p => p.status === 'Warning');

    const responseData: StockHealthDetailsResponse = {
      critical: criticalWithInsights,
      warning: warningWithInsights,
      totalCritical: details.totalCritical,
      totalWarning: details.totalWarning,
      generatedAt: new Date().toISOString(),
      warehouseFilter: warehouseId
    };

    // Cache the result
    stockHealthDetailsCache = {
      data: responseData,
      timestamp: now,
      warehouseFilter: warehouseId
    };

    res.json(responseData);
  } catch (error: any) {
    console.error('Error fetching stock health details:', error);
    res.status(500).json({
      error: 'Failed to fetch stock health details',
      message: error.message
    });
  }
});

// Get product performance analysis
router.get('/product-performance', async (req: Request, res: Response) => {
  try {
    const warehouseId = req.query.warehouseId as string | undefined;
    const categoryFilter = req.query.category as ProductCategory | undefined;
    const now = Date.now();

    // Check cache (5-minute TTL, match filters)
    if (
      performanceCache &&
      now - performanceCache.timestamp < 300000 &&
      performanceCache.warehouseFilter === warehouseId &&
      performanceCache.categoryFilter === categoryFilter
    ) {
      return res.json(performanceCache.data);
    }

    // Fetch performance data
    const performanceData = await analytics.getProductPerformance(
      warehouseId,
      categoryFilter,
      30 // 30-day window
    );

    const responseData: ProductPerformanceResponse = {
      ...performanceData,
      generatedAt: new Date().toISOString(),
      warehouseFilter: warehouseId,
      categoryFilter
    };

    // Cache the result
    performanceCache = {
      data: responseData,
      timestamp: now,
      warehouseFilter: warehouseId,
      categoryFilter
    };

    res.json(responseData);
  } catch (error: any) {
    console.error('Error fetching product performance:', error);
    res.status(500).json({
      error: 'Failed to fetch product performance',
      message: error.message
    });
  }
});

// Get AI-generated product performance insights
router.get('/product-performance-insights', async (req: Request, res: Response) => {
  try {
    const warehouseId = req.query.warehouseId as string | undefined;
    const categoryFilter = req.query.category as ProductCategory | undefined;

    // Fetch performance data (will use cache if available)
    const performanceData = await analytics.getProductPerformance(
      warehouseId,
      categoryFilter,
      30
    );

    // Build prompt for AI
    const topStarsText = performanceData.topStars
      .map((p, i) => `${i + 1}. ${p.productName} (${p.sku}) - Turnover: ${p.turnoverRate.toFixed(2)}, Revenue Potential: Rp ${p.revenuePotential.toLocaleString('id-ID')}`)
      .join('\n');

    const bottomDogsText = performanceData.bottomDogs
      .map((p, i) => `${i + 1}. ${p.productName} (${p.sku}) - Turnover: ${p.turnoverRate.toFixed(2)}, Revenue Potential: Rp ${p.revenuePotential.toLocaleString('id-ID')}`)
      .join('\n');

    const prompt = `Analisis performa produk berdasarkan BCG Matrix (30 hari terakhir):

**Distribusi Kategori:**
- ⭐ Stars (High Turnover + High Revenue): ${performanceData.summary.stars} produk
- 💰 Cash Cows (Low Turnover + High Revenue): ${performanceData.summary.cashCows} produk
- ❓ Question Marks (High Turnover + Low Revenue): ${performanceData.summary.questionMarks} produk
- ❌ Dogs (Low Turnover + Low Revenue): ${performanceData.summary.dogs} produk

**Threshold Dinamis:**
- Median Turnover Rate: ${performanceData.summary.medianTurnover.toFixed(2)}
- Median Revenue Potential: Rp ${performanceData.summary.medianRevenue.toLocaleString('id-ID')}

**Top 5 Stars (Best Performers):**
${topStarsText}

**Bottom 5 Dogs (Worst Performers):**
${bottomDogsText}

${warehouseId ? `\n**Filter Gudang:** ${warehouseId}` : ''}
${categoryFilter ? `\n**Filter Kategori:** ${categoryFilter}` : ''}

Berikan analisis dalam format Markdown dengan struktur:

### 🎯 Insight Utama
[2-3 paragraf tentang pola distribusi kategori, apa artinya untuk bisnis, dan trend yang terlihat. Gunakan **bold** untuk highlight key findings]

### ⭐ Analisis Top Performers (Stars)
[Paragraf tentang karakteristik Stars, mengapa mereka perform well, dan strategi untuk maintain. Highlight nama produk dengan **bold**]

### ❌ Analisis Underperformers (Dogs)
[Paragraf tentang pola Dogs, root cause analysis, dan apakah perlu discontinued atau direposisi. Highlight nama produk dengan **bold**]

### 💡 Rekomendasi Strategis
[Paragraf dengan 3-4 action items spesifik dan terukur untuk optimasi portfolio. Gunakan **bold** untuk action verbs]

PENTING:
- Gunakan heading ### untuk sections
- **Bold** untuk produk, angka, dan key points
- Bahasa Indonesia profesional
- Fokus pada actionable insights
- Jangan gunakan bullet points, hanya paragraf`;

    const systemMessage = 'Anda adalah AI Analyst untuk product portfolio management. Berikan analisis BCG Matrix yang mendalam, actionable, dan strategis dalam Bahasa Indonesia.';
    const insightsText = await deepseek.generateTextOnly(prompt, systemMessage);

    const responseData: ProductPerformanceInsightResponse = {
      insights: insightsText,
      topPerformers: performanceData.topStars.map(p => p.productName),
      bottomPerformers: performanceData.bottomDogs.map(p => p.productName),
      recommendations: [], // Extracted from AI text if needed
      generatedAt: new Date().toISOString()
    };

    res.json(responseData);
  } catch (error: any) {
    console.error('Error generating product performance insights:', error);
    res.status(500).json({
      error: 'Failed to generate insights',
      message: error.message
    });
  }
});

export default router;
