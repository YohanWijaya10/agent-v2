import database from './database';
import {
  DashboardMetrics,
  InventoryValueByCategory,
  StockMovementData,
  TopProductData,
  WarehouseDistributionData,
  StockHealthData,
  UpcomingPOData,
  SupplierPerformance,
  SlowMovingItem,
  ReorderRecommendation,
  StockTurnoverData,
  Product,
  InventoryBalance,
  PurchaseOrderItem,
  ProductCategory,
  ProductHealthDetail,
  ProductPerformanceData,
  PerformanceSummary,
  PerformanceCategory,
  InventoryTransaction,
  AnomalyItem,
  AlertSummary,
  StockoutHistoryItem,
  SeverityLevel,
  SafetyStockPolicy,
  SafetyStockAutoAdjustResponse,
  SafetyStockAdjustment
} from '../types';

class AnalyticsService {

  async calculateTotalInventoryValue(): Promise<number> {
    const [balances, products, poItems] = await Promise.all([
      database.getInventoryBalances(),
      database.getProducts(),
      database.getPurchaseOrderItems()
    ]);

    // Create a map of latest unit costs from PO items
    const latestUnitCost = new Map<string, number>();

    // Sort PO items by creation date descending to get latest
    const sortedPOItems = [...poItems].sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    for (const item of sortedPOItems) {
      if (!latestUnitCost.has(item.productId)) {
        latestUnitCost.set(item.productId, item.unitCost);
      }
    }

    // Calculate total value
    let totalValue = 0;
    for (const balance of balances) {
      const unitCost = latestUnitCost.get(balance.productId) || 0;
      totalValue += balance.qtyOnHand * unitCost;
    }

    return totalValue;
  }

  async getProductsBelowSafetyStock(): Promise<number> {
    const balances = await database.getInventoryBalances();
    // NOTE: Data has safetyStock and reorderPoint swapped
    // Using reorderPoint as the critical threshold (lower value)
    return balances.filter(b => b.qtyOnHand < b.reorderPoint).length;
  }

  async calculatePendingPOValue(): Promise<number> {
    const [purchaseOrders, poItems] = await Promise.all([
      database.getPurchaseOrders(),
      database.getPurchaseOrderItems()
    ]);

    const pendingPOs = purchaseOrders.filter(
      po => po.status.toLowerCase() !== 'completed' && po.status.toLowerCase() !== 'cancelled'
    );

    let totalValue = 0;
    for (const po of pendingPOs) {
      const items = poItems.filter(item => item.poId === po.poId);
      for (const item of items) {
        totalValue += item.qtyOrdered * item.unitCost;
      }
    }

    return totalValue;
  }

  async getDashboardMetrics(): Promise<DashboardMetrics> {
    const [products, suppliers, warehouses] = await Promise.all([
      database.getProducts(),
      database.getSuppliers(),
      database.getWarehouses()
    ]);

    const [totalInventoryValue, productsBelowSafetyStock, pendingPOValue] = await Promise.all([
      this.calculateTotalInventoryValue(),
      this.getProductsBelowSafetyStock(),
      this.calculatePendingPOValue()
    ]);

    return {
      totalInventoryValue,
      totalActiveProducts: products.filter(p => p.isActive).length,
      productsBelowSafetyStock,
      pendingPOValue,
      totalActiveSuppliers: suppliers.filter(s => s.isActive).length,
      totalWarehouses: warehouses.filter(w => w.isActive).length
    };
  }

  async getInventoryValueByCategory(): Promise<InventoryValueByCategory[]> {
    const [balances, products, poItems] = await Promise.all([
      database.getInventoryBalances(),
      database.getProducts(),
      database.getPurchaseOrderItems()
    ]);

    // Create product map
    const productMap = new Map(products.map(p => [p.productId, p]));

    // Create latest unit cost map
    const latestUnitCost = new Map<string, number>();
    const sortedPOItems = [...poItems].sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    for (const item of sortedPOItems) {
      if (!latestUnitCost.has(item.productId)) {
        latestUnitCost.set(item.productId, item.unitCost);
      }
    }

    // Calculate value by category
    const categoryValues = new Map<ProductCategory, number>();

    for (const balance of balances) {
      const product = productMap.get(balance.productId);
      if (!product) continue;

      const unitCost = latestUnitCost.get(balance.productId) || 0;
      const value = balance.qtyOnHand * unitCost;

      const currentValue = categoryValues.get(product.category) || 0;
      categoryValues.set(product.category, currentValue + value);
    }

    const totalValue = Array.from(categoryValues.values()).reduce((sum, val) => sum + val, 0);

    return Array.from(categoryValues.entries()).map(([category, value]) => ({
      category,
      value,
      percentage: totalValue > 0 ? (value / totalValue) * 100 : 0
    }));
  }

  async getStockMovementTrend(days: number = 30): Promise<StockMovementData[]> {
    const transactions = await database.getInventoryTransactions();

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Filter transactions within date range
    const filteredTrx = transactions.filter(t => {
      const trxDate = new Date(t.trxDate);
      return trxDate >= startDate && trxDate <= endDate;
    });

    // Group by date
    const dailyData = new Map<string, { receipt: number; issue: number }>();

    for (const trx of filteredTrx) {
      const dateKey = trx.trxDate.split('T')[0];
      const current = dailyData.get(dateKey) || { receipt: 0, issue: 0 };

      if (trx.trxType === 'RECEIPT') {
        current.receipt += Number(trx.qty);
      } else if (trx.trxType === 'ISSUE') {
        current.issue += Number(trx.qty);
      }

      dailyData.set(dateKey, current);
    }

    // Convert to array and sort by date
    const result: StockMovementData[] = Array.from(dailyData.entries())
      .map(([date, data]) => ({
        date,
        receipt: data.receipt,
        issue: data.issue,
        net: data.receipt - data.issue
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return result;
  }

  async getTopProductsByValue(limit: number = 10): Promise<TopProductData[]> {
    const [balances, products, poItems] = await Promise.all([
      database.getInventoryBalances(),
      database.getProducts(),
      database.getPurchaseOrderItems()
    ]);

    const productMap = new Map(products.map(p => [p.productId, p]));

    // Create latest unit cost map
    const latestUnitCost = new Map<string, number>();
    const sortedPOItems = [...poItems].sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    for (const item of sortedPOItems) {
      if (!latestUnitCost.has(item.productId)) {
        latestUnitCost.set(item.productId, item.unitCost);
      }
    }

    // Calculate product values
    const productValues = balances.map(balance => {
      const product = productMap.get(balance.productId);
      const unitCost = latestUnitCost.get(balance.productId) || 0;
      const value = balance.qtyOnHand * unitCost;

      return {
        productId: balance.productId,
        productName: product?.name || 'Unknown',
        sku: product?.sku || '',
        value,
        qty: balance.qtyOnHand
      };
    });

    // Sort by value and get top N
    return productValues
      .sort((a, b) => b.value - a.value)
      .slice(0, limit);
  }

  async getWarehouseDistribution(): Promise<WarehouseDistributionData[]> {
    const [balances, products, warehouses] = await Promise.all([
      database.getInventoryBalances(),
      database.getProducts(),
      database.getWarehouses()
    ]);

    const productMap = new Map(products.map(p => [p.productId, p]));
    const warehouseMap = new Map(warehouses.map(w => [w.warehouseId, w]));

    // Group by warehouse and category (dynamic categories)
    const warehouseData = new Map<string, Record<string, number>>();

    for (const balance of balances) {
      const product = productMap.get(balance.productId);
      if (!product) continue;

      const warehouseName = warehouseMap.get(balance.warehouseId)?.name || 'Unknown';

      if (!warehouseData.has(warehouseName)) {
        warehouseData.set(warehouseName, {});
      }

      const data = warehouseData.get(warehouseName)!;
      const current = Number(data[product.category]) || 0;
      const add = Number((balance as any).qtyOnHand);
      data[product.category] = current + (isNaN(add) ? 0 : add);
    }

    return Array.from(warehouseData.entries()).map(([warehouseName, categories]) => ({
      warehouseName,
      ...categories
    }));
  }

  async getStockHealthStatus(): Promise<StockHealthData[]> {
    const balances = await database.getInventoryBalances();

    let critical = 0;
    let warning = 0;
    let ok = 0;

    for (const balance of balances) {
      // NOTE: Data has safetyStock and reorderPoint swapped
      // In the database: safetyStock > reorderPoint (incorrect)
      // So we swap the comparison logic:
      // - Critical: qty < reorderPoint (lower threshold)
      // - Warning: qty >= reorderPoint AND qty < safetyStock
      // - OK: qty >= safetyStock
      if (balance.qtyOnHand < balance.reorderPoint) {
        critical++;
      } else if (balance.qtyOnHand < balance.safetyStock) {
        warning++;
      } else {
        ok++;
      }
    }

    const total = balances.length;

    return [
      {
        status: 'Critical',
        count: critical,
        percentage: total > 0 ? (critical / total) * 100 : 0
      },
      {
        status: 'Warning',
        count: warning,
        percentage: total > 0 ? (warning / total) * 100 : 0
      },
      {
        status: 'OK',
        count: ok,
        percentage: total > 0 ? (ok / total) * 100 : 0
      }
    ];
  }

  async getUpcomingPOs(): Promise<UpcomingPOData[]> {
    const [purchaseOrders, poItems, suppliers] = await Promise.all([
      database.getPurchaseOrders(),
      database.getPurchaseOrderItems(),
      database.getSuppliers()
    ]);

    const supplierMap = new Map(suppliers.map(s => [s.supplierId, s]));

    const today = new Date();
    const upcomingPOs = purchaseOrders.filter(po => {
      const expectedDate = new Date(po.expectedDate);
      return expectedDate >= today && po.status.toLowerCase() !== 'completed' && po.status.toLowerCase() !== 'cancelled';
    });

    return upcomingPOs.map(po => {
      const items = poItems.filter(item => item.poId === po.poId);
      const totalValue = items.reduce((sum, item) => sum + (item.qtyOrdered * item.unitCost), 0);
      const supplier = supplierMap.get(po.supplierId);

      return {
        poId: po.poId,
        supplierName: supplier?.name || 'Unknown',
        expectedDate: po.expectedDate,
        totalValue,
        itemCount: items.length,
        status: po.status
      };
    }).sort((a, b) => a.expectedDate.localeCompare(b.expectedDate));
  }

  async getSupplierPerformance(): Promise<SupplierPerformance[]> {
    const [purchaseOrders, poItems, suppliers] = await Promise.all([
      database.getPurchaseOrders(),
      database.getPurchaseOrderItems(),
      database.getSuppliers()
    ]);

    const supplierMap = new Map(suppliers.map(s => [s.supplierId, s]));
    const performanceMap = new Map<string, SupplierPerformance>();

    for (const po of purchaseOrders) {
      const supplier = supplierMap.get(po.supplierId);
      if (!supplier) continue;

      if (!performanceMap.has(po.supplierId)) {
        performanceMap.set(po.supplierId, {
          supplierId: po.supplierId,
          supplierName: supplier.name,
          totalOrders: 0,
          onTimeDeliveries: 0,
          lateDeliveries: 0,
          averageDelayDays: 0,
          totalValue: 0
        });
      }

      const perf = performanceMap.get(po.supplierId)!;
      perf.totalOrders++;

      // Calculate if PO was late
      if (po.status.toLowerCase() === 'completed') {
        const expectedDate = new Date(po.expectedDate);
        const updatedDate = new Date(po.updatedAt);
        const delayDays = Math.floor((updatedDate.getTime() - expectedDate.getTime()) / (1000 * 60 * 60 * 24));

        if (delayDays > 0) {
          perf.lateDeliveries++;
          perf.averageDelayDays += delayDays;
        } else {
          perf.onTimeDeliveries++;
        }
      }

      // Calculate total value
      const items = poItems.filter(item => item.poId === po.poId);
      const poValue = items.reduce((sum, item) => sum + (item.qtyOrdered * item.unitCost), 0);
      perf.totalValue += poValue;
    }

    // Calculate average delay
    for (const perf of performanceMap.values()) {
      if (perf.lateDeliveries > 0) {
        perf.averageDelayDays = perf.averageDelayDays / perf.lateDeliveries;
      }
    }

    return Array.from(performanceMap.values());
  }

  async getSlowMovingItems(days: number = 90): Promise<SlowMovingItem[]> {
    const [transactions, balances, products, warehouses] = await Promise.all([
      database.getInventoryTransactions(),
      database.getInventoryBalances(),
      database.getProducts(),
      database.getWarehouses()
    ]);

    const productMap = new Map(products.map(p => [p.productId, p]));
    const warehouseMap = new Map(warehouses.map(w => [w.warehouseId, w]));

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const slowMovingItems: SlowMovingItem[] = [];

    for (const balance of balances) {
      if (balance.qtyOnHand === 0) continue;

      // Find last ISSUE transaction for this product/warehouse
      const lastIssue = transactions
        .filter(t =>
          t.productId === balance.productId &&
          t.warehouseId === balance.warehouseId &&
          t.trxType === 'ISSUE'
        )
        .sort((a, b) => new Date(b.trxDate).getTime() - new Date(a.trxDate).getTime())[0];

      const lastIssueDate = lastIssue ? new Date(lastIssue.trxDate) : null;
      const daysSinceLastIssue = lastIssueDate
        ? Math.floor((new Date().getTime() - lastIssueDate.getTime()) / (1000 * 60 * 60 * 24))
        : 999;

      if (daysSinceLastIssue >= days) {
        const product = productMap.get(balance.productId);
        const warehouse = warehouseMap.get(balance.warehouseId);

        slowMovingItems.push({
          productId: balance.productId,
          productName: product?.name || 'Unknown',
          warehouseId: balance.warehouseId,
          warehouseName: warehouse?.name || 'Unknown',
          qtyOnHand: balance.qtyOnHand,
          lastIssueDate: lastIssueDate ? lastIssueDate.toISOString() : null,
          daysSinceLastIssue,
          value: 0 // Would need PO data to calculate
        });
      }
    }

    return slowMovingItems;
  }

  async getReorderRecommendations(): Promise<ReorderRecommendation[]> {
    const [balances, products, warehouses] = await Promise.all([
      database.getInventoryBalances(),
      database.getProducts(),
      database.getWarehouses()
    ]);

    const productMap = new Map(products.map(p => [p.productId, p]));
    const warehouseMap = new Map(warehouses.map(w => [w.warehouseId, w]));

    const recommendations: ReorderRecommendation[] = [];

    for (const balance of balances) {
      // NOTE: Data has safetyStock and reorderPoint swapped
      // Trigger reorder when qty < safetyStock (target level)
      if (balance.qtyOnHand < balance.safetyStock) {
        const product = productMap.get(balance.productId);
        const warehouse = warehouseMap.get(balance.warehouseId);

        const deficit = balance.safetyStock - balance.qtyOnHand;
        const recommendedQty = Math.max(deficit, balance.safetyStock);

        let urgency: 'High' | 'Medium' | 'Low' = 'Low';
        // High urgency if below critical threshold (reorderPoint)
        if (balance.qtyOnHand < balance.reorderPoint) {
          urgency = 'High';
        } else if (balance.qtyOnHand < balance.safetyStock * 0.7) {
          urgency = 'Medium';
        }

        recommendations.push({
          productId: balance.productId,
          productName: product?.name || 'Unknown',
          warehouseId: balance.warehouseId,
          warehouseName: warehouse?.name || 'Unknown',
          currentQty: balance.qtyOnHand,
          safetyStock: balance.safetyStock,
          reorderPoint: balance.reorderPoint,
          recommendedQty,
          urgency
        });
      }
    }

    return recommendations.sort((a, b) => {
      const urgencyOrder = { High: 0, Medium: 1, Low: 2 };
      return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    });
  }

  async getStockTurnover(days: number = 30): Promise<StockTurnoverData[]> {
    const [transactions, balances, products] = await Promise.all([
      database.getInventoryTransactions(),
      database.getInventoryBalances(),
      database.getProducts()
    ]);

    const productMap = new Map(products.map(p => [p.productId, p]));

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const turnoverData: StockTurnoverData[] = [];

    for (const product of products) {
      // Get total issued in period
      const totalIssued = transactions
        .filter(t =>
          t.productId === product.productId &&
          t.trxType === 'ISSUE' &&
          new Date(t.trxDate) >= cutoffDate
        )
        .reduce((sum, t) => sum + t.qty, 0);

      // Get average on hand
      const productBalances = balances.filter(b => b.productId === product.productId);
      const averageOnHand = productBalances.reduce((sum, b) => sum + b.qtyOnHand, 0) / (productBalances.length || 1);

      const turnoverRate = averageOnHand > 0 ? totalIssued / averageOnHand : 0;

      turnoverData.push({
        productId: product.productId,
        productName: product.name,
        category: product.category,
        totalIssued,
        averageOnHand,
        turnoverRate
      });
    }

    return turnoverData.sort((a, b) => b.turnoverRate - a.turnoverRate);
  }

  // Auto-adjust safety stock per warehouse
  async autoAdjustSafetyStock(
    warehouseId: string,
    policy: SafetyStockPolicy = {}
  ): Promise<SafetyStockAutoAdjustResponse> {
    const {
      serviceLevel = 0.95,
      leadTimeDays = 7,
      maxChangePercent = 20,
      roundToPack = null,
      minSafetyStock = 0
    } = policy;

    const zTable: Record<number, number> = {
      0.9: 1.2816,
      0.95: 1.6449,
      0.975: 1.96,
      0.99: 2.3263
    } as const;
    // Use nearest key if not exact
    const nearest = Object.keys(zTable)
      .map(Number)
      .reduce((prev, curr) => (Math.abs(curr - serviceLevel) < Math.abs(prev - serviceLevel) ? curr : prev), 0.95);
    const z = zTable[nearest] || 1.6449;

    const windowDays = 30;
    const [transactions, balances, products, warehouses] = await Promise.all([
      database.getInventoryTransactions(),
      database.getInventoryBalances(),
      database.getProducts(),
      database.getWarehouses()
    ]);

    const productMap = new Map(products.map(p => [p.productId, p]));
    const warehouseMap = new Map(warehouses.map(w => [w.warehouseId, w]));

    const targetBalances = balances.filter(b => b.warehouseId === warehouseId);

    // Build date keys for last windowDays
    const dates: string[] = [];
    const today = new Date();
    for (let i = windowDays - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      dates.push(d.toISOString().slice(0, 10));
    }

    // Index transactions by day/product for quick sum (ISSUE only)
    const trxByKey = new Map<string, number>();
    for (const t of transactions) {
      if (t.trxType !== 'ISSUE') continue;
      const d = new Date(t.trxDate).toISOString().slice(0, 10);
      if (!dates.includes(d)) continue;
      const key = `${d}|${t.productId}|${t.warehouseId}`;
      trxByKey.set(key, (trxByKey.get(key) || 0) + Number(t.qty));
    }

    const changes: SafetyStockAdjustment[] = [];

    for (const bal of targetBalances) {
      const daily: number[] = dates.map(date => trxByKey.get(`${date}|${bal.productId}|${bal.warehouseId}`) || 0);
      // Basic robust stats: clamp extreme outliers at 95th percentile
      const sorted = [...daily].sort((a, b) => a - b);
      const p95 = sorted[Math.floor(0.95 * (sorted.length - 1))] || 0;
      const clamped = daily.map(v => Math.min(v, p95));
      const mean = clamped.reduce((s, v) => s + v, 0) / (clamped.length || 1);
      const variance = clamped.reduce((s, v) => s + (v - mean) * (v - mean), 0) / (Math.max(1, clamped.length - 1));
      const stdDaily = Math.sqrt(variance);

      const sigmaLT = stdDaily * Math.sqrt(Math.max(1, leadTimeDays));
      let recommended = Math.max(minSafetyStock, Math.round(z * sigmaLT));

      // Apply change cap relative to current
      const current = Number(bal.safetyStock) || 0;
      if (maxChangePercent > 0) {
        const maxUp = Math.round(current * (1 + maxChangePercent / 100));
        const maxDown = Math.round(current * (1 - maxChangePercent / 100));
        recommended = Math.min(recommended, maxUp);
        recommended = Math.max(recommended, maxDown);
      }

      // Round to pack if provided
      if (roundToPack && roundToPack > 0) {
        const packs = Math.max(1, Math.round(recommended / roundToPack));
        recommended = packs * roundToPack;
      }

      if (!Number.isFinite(recommended)) recommended = current;

      if (recommended !== current) {
        // Persist change
        await database.updateInventoryBalance(bal.warehouseId, bal.productId, { safetyStock: recommended });
        const product = productMap.get(bal.productId);
        const wh = warehouseMap.get(bal.warehouseId);
        const changePercent = current === 0 ? 100 : ((recommended - current) / Math.max(1, current)) * 100;
        changes.push({
          productId: bal.productId,
          productName: product?.name || 'Unknown',
          warehouseId: bal.warehouseId,
          warehouseName: wh?.name || 'Unknown',
          currentSafetyStock: current,
          recommendedSafetyStock: recommended,
          changePercent,
          reason: `z=${z.toFixed(2)}, σ_d=${stdDaily.toFixed(2)}, LT=${leadTimeDays}d`
        });
      }
    }

    return {
      warehouseId,
      appliedCount: changes.length,
      totalCandidates: targetBalances.length,
      changes: changes.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent)),
      generatedAt: new Date().toISOString()
    };
  }

  async generateExecutiveSummary(): Promise<{
    metrics: DashboardMetrics;
    inventory: InventoryValueByCategory[];
    stockHealth: StockHealthData[];
    recommendations: ReorderRecommendation[];
    slowMovingCount: number;
    upcomingPOs: UpcomingPOData[];
  }> {
    const [metrics, inventory, stockHealth, recommendations, slowMoving, upcomingPOs] =
      await Promise.all([
        this.getDashboardMetrics(),
        this.getInventoryValueByCategory(),
        this.getStockHealthStatus(),
        this.getReorderRecommendations(),
        this.getSlowMovingItems(90),
        this.getUpcomingPOs()
      ]);

    return {
      metrics,
      inventory,
      stockHealth,
      recommendations: recommendations.slice(0, 5), // Top 5 urgent items
      slowMovingCount: slowMoving.length,
      upcomingPOs: upcomingPOs.slice(0, 3) // Next 3 POs
    };
  }

  async getStockHealthDetails(warehouseId?: string, limit: number = 10): Promise<{
    critical: ProductHealthDetail[];
    warning: ProductHealthDetail[];
    totalCritical: number;
    totalWarning: number;
  }> {
    const [balances, products, warehouses] = await Promise.all([
      database.getInventoryBalances(),
      database.getProducts(),
      database.getWarehouses()
    ]);

    const productMap = new Map(products.map(p => [p.productId, p]));
    const warehouseMap = new Map(warehouses.map(w => [w.warehouseId, w]));

    // Filter by warehouse if specified
    const filteredBalances = warehouseId
      ? balances.filter(b => b.warehouseId === warehouseId)
      : balances;

    const criticalItems: ProductHealthDetail[] = [];
    const warningItems: ProductHealthDetail[] = [];

    for (const balance of filteredBalances) {
      const product = productMap.get(balance.productId);
      const warehouse = warehouseMap.get(balance.warehouseId);
      if (!product || !warehouse) continue;

      const detail: ProductHealthDetail = {
        productId: balance.productId,
        productName: product.name,
        warehouseId: balance.warehouseId,
        warehouseName: warehouse.name,
        qtyOnHand: balance.qtyOnHand,
        safetyStock: balance.safetyStock,
        reorderPoint: balance.reorderPoint,
        status: 'Critical'
      };

      // NOTE: Data has safetyStock and reorderPoint swapped
      // Using swapped comparison logic (same as getStockHealthStatus)
      if (balance.qtyOnHand < balance.reorderPoint) {
        detail.status = 'Critical';
        criticalItems.push(detail);
      } else if (balance.qtyOnHand < balance.safetyStock) {
        detail.status = 'Warning';
        warningItems.push(detail);
      }
    }

    // Sort by urgency (most critical first)
    // Using swapped logic: critical uses reorderPoint, warning uses safetyStock
    criticalItems.sort((a, b) => (a.qtyOnHand / a.reorderPoint) - (b.qtyOnHand / b.reorderPoint));
    warningItems.sort((a, b) => (a.qtyOnHand / a.safetyStock) - (b.qtyOnHand / b.safetyStock));

    return {
      critical: criticalItems.slice(0, limit),
      warning: warningItems.slice(0, limit),
      totalCritical: criticalItems.length,
      totalWarning: warningItems.length
    };
  }

  async getProductPerformance(
    warehouseId?: string,
    categoryFilter?: ProductCategory,
    days: number = 30
  ): Promise<{
    summary: PerformanceSummary;
    products: ProductPerformanceData[];
    topStars: ProductPerformanceData[];
    bottomDogs: ProductPerformanceData[];
  }> {
    // Step 1: Parallel fetch all required data
    const [transactions, balances, products, poItems, warehouses] = await Promise.all([
      database.getInventoryTransactions(),
      database.getInventoryBalances(),
      database.getProducts(),
      database.getPurchaseOrderItems(),
      database.getWarehouses()
    ]);

    // Step 2: Build lookup maps for O(1) performance
    const productMap = new Map(products.map(p => [p.productId, p]));
    const warehouseMap = new Map(warehouses.map(w => [w.warehouseId, w]));

    // Latest unit cost map (sorted by createdAt desc, take first)
    const latestUnitCost = new Map<string, number>();
    const sortedPOItems = [...poItems].sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    for (const item of sortedPOItems) {
      if (!latestUnitCost.has(item.productId)) {
        latestUnitCost.set(item.productId, item.unitCost);
      }
    }

    // Step 3: Calculate cutoff date
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    // Step 4: Filter balances by warehouse if specified
    const filteredBalances = warehouseId
      ? balances.filter(b => b.warehouseId === warehouseId)
      : balances;

    // Step 5: Calculate performance metrics per product
    const performanceData: ProductPerformanceData[] = [];

    for (const product of products) {
      // Apply category filter if specified
      if (categoryFilter && product.category !== categoryFilter) continue;

      // Get total ISSUE qty in last N days
      const totalIssued = transactions
        .filter(t =>
          t.productId === product.productId &&
          t.trxType === 'ISSUE' &&
          new Date(t.trxDate) >= cutoffDate &&
          (!warehouseId || t.warehouseId === warehouseId)
        )
        .reduce((sum, t) => sum + t.qty, 0);

      // Get average stock on hand across filtered warehouses
      const productBalances = filteredBalances.filter(b => b.productId === product.productId);
      if (productBalances.length === 0) continue; // Skip if no inventory in filtered warehouses

      const averageOnHand = productBalances.reduce((sum, b) => sum + b.qtyOnHand, 0) / productBalances.length;

      // Skip products with zero average stock (avoid division by zero)
      if (averageOnHand === 0) continue;

      // Calculate metrics
      const turnoverRate = totalIssued / averageOnHand;
      const unitCost = latestUnitCost.get(product.productId) || 0;
      const revenuePotential = unitCost * totalIssued;

      // For warehouse-specific view, include warehouse info
      let warehouseInfo: { warehouseId?: string; warehouseName?: string } = {};
      if (warehouseId && productBalances.length > 0) {
        warehouseInfo = {
          warehouseId: productBalances[0].warehouseId,
          warehouseName: warehouseMap.get(productBalances[0].warehouseId)?.name
        };
      }

      performanceData.push({
        productId: product.productId,
        productName: product.name,
        sku: product.sku,
        category: product.category,
        turnoverRate,
        revenuePotential,
        totalIssued30Days: totalIssued,
        averageOnHand,
        latestUnitCost: unitCost,
        performanceCategory: 'Question Mark', // Will be set in next step
        ...warehouseInfo
      });
    }

    // Step 6: Calculate median split for dynamic categorization
    const turnoverRates = performanceData.map(p => p.turnoverRate).sort((a, b) => a - b);
    const revenuePotentials = performanceData.map(p => p.revenuePotential).sort((a, b) => a - b);

    const medianTurnover = turnoverRates.length > 0
      ? turnoverRates[Math.floor(turnoverRates.length / 2)]
      : 0;
    const medianRevenue = revenuePotentials.length > 0
      ? revenuePotentials[Math.floor(revenuePotentials.length / 2)]
      : 0;

    // Step 7: Categorize products into quadrants
    let stars = 0, cashCows = 0, questionMarks = 0, dogs = 0;

    for (const product of performanceData) {
      const highTurnover = product.turnoverRate >= medianTurnover;
      const highRevenue = product.revenuePotential >= medianRevenue;

      if (highTurnover && highRevenue) {
        product.performanceCategory = 'Star';
        stars++;
      } else if (!highTurnover && highRevenue) {
        product.performanceCategory = 'Cash Cow';
        cashCows++;
      } else if (highTurnover && !highRevenue) {
        product.performanceCategory = 'Question Mark';
        questionMarks++;
      } else {
        product.performanceCategory = 'Dog';
        dogs++;
      }
    }

    // Step 8: Sort and extract top/bottom performers
    const starProducts = performanceData
      .filter(p => p.performanceCategory === 'Star')
      .sort((a, b) => b.revenuePotential - a.revenuePotential);

    const dogProducts = performanceData
      .filter(p => p.performanceCategory === 'Dog')
      .sort((a, b) => a.revenuePotential - b.revenuePotential);

    return {
      summary: {
        stars,
        cashCows,
        questionMarks,
        dogs,
        medianTurnover,
        medianRevenue
      },
      products: performanceData,
      topStars: starProducts.slice(0, 5),
      bottomDogs: dogProducts.slice(0, 5)
    };
  }

  async detectUnusualTransactions(
    lookbackDays: number = 7,
    thresholdPercentage: number = 150
  ): Promise<AnomalyItem[]> {
    const [transactions, products, warehouses] = await Promise.all([
      database.getInventoryTransactions(),
      database.getProducts(),
      database.getWarehouses()
    ]);

    const productMap = new Map(products.map(p => [p.productId, p]));
    const warehouseMap = new Map(warehouses.map(w => [w.warehouseId, w]));

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - lookbackDays);

    const baselineCutoff = new Date(cutoffDate);
    baselineCutoff.setDate(baselineCutoff.getDate() - lookbackDays);

    const anomalies: AnomalyItem[] = [];

    // Group transactions by product/warehouse/type
    const recentTrx = transactions.filter(t => new Date(t.trxDate) >= cutoffDate);
    const baselineTrx = transactions.filter(t => {
      const date = new Date(t.trxDate);
      return date >= baselineCutoff && date < cutoffDate;
    });

    // Calculate averages per product/warehouse/type
    const calculateAverage = (trxList: InventoryTransaction[], prodId: string, whId: string, type: 'ISSUE' | 'RECEIPT') => {
      const filtered = trxList.filter(t =>
        t.productId === prodId && t.warehouseId === whId && t.trxType === type
      );
      if (filtered.length === 0) return 0;
      return filtered.reduce((sum, t) => sum + t.qty, 0) / lookbackDays;
    };

    // Compare recent vs baseline
    const productWarehousePairs = new Set(
      recentTrx.map(t => `${t.productId}|${t.warehouseId}|${t.trxType}`)
    );

    for (const pair of productWarehousePairs) {
      const [productId, warehouseId, trxType] = pair.split('|');
      const type = trxType as 'ISSUE' | 'RECEIPT';

      const baselineAvg = calculateAverage(baselineTrx, productId, warehouseId, type);
      const recentAvg = calculateAverage(recentTrx, productId, warehouseId, type);

      // Skip if no baseline data
      if (baselineAvg === 0) continue;

      const changePercentage = ((recentAvg - baselineAvg) / baselineAvg) * 100;

      // Detect anomaly if change > threshold
      if (Math.abs(changePercentage) >= thresholdPercentage) {
        const product = productMap.get(productId);
        const warehouse = warehouseMap.get(warehouseId);

        let severity: SeverityLevel = 'low';
        if (Math.abs(changePercentage) >= 300) severity = 'critical';
        else if (Math.abs(changePercentage) >= 200) severity = 'high';
        else if (Math.abs(changePercentage) >= 150) severity = 'medium';

        // Root-cause heuristics using recent/baseline windows
        const rec = recentTrx.filter(t => t.productId === productId && t.warehouseId === warehouseId && t.trxType === type);
        const base = baselineTrx.filter(t => t.productId === productId && t.warehouseId === warehouseId && t.trxType === type);
        const groupByDay = (list: InventoryTransaction[]) => {
          const m = new Map<string, number>();
          for (const t of list) {
            const d = new Date(t.trxDate);
            const key = `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
            m.set(key, (m.get(key) || 0) + t.qty);
          }
          return m;
        };
        const recDaily = groupByDay(rec);
        const baseDaily = groupByDay(base);
        const recActiveDays = Array.from(recDaily.values()).filter(v => v > 0).length;
        const baseActiveDays = Array.from(baseDaily.values()).filter(v => v > 0).length;
        const maxRecDaily = Math.max(0, ...Array.from(recDaily.values()));
        const dupKey = (t: InventoryTransaction) => `${t.refType}|${t.refId}|${t.productId}|${t.trxType}`;
        const dupMap = new Map<string, number>();
        for (const t of rec) dupMap.set(dupKey(t), (dupMap.get(dupKey(t)) || 0) + 1);
        const hasDuplicate = Array.from(dupMap.values()).some(c => c > 1);

        let probableCause: AnomalyItem['probableCause'] = 'unknown';
        const extreme = maxRecDaily > 5 * Math.max(1, recentAvg);
        if (hasDuplicate) probableCause = 'duplicate_entry';
        else if (extreme) probableCause = 'data_error';
        else if (type === 'ISSUE' && changePercentage > 0) probableCause = 'demand_spike';
        else if (type === 'RECEIPT' && changePercentage < 0) probableCause = 'receipt_delay';
        else if (Math.abs(changePercentage) >= thresholdPercentage && recActiveDays >= 5 && baseActiveDays >= 5) probableCause = 'process_change';

        anomalies.push({
          anomalyId: `${productId}-${warehouseId}-${type}-${Date.now()}`,
          type: 'unusual_transaction',
          productId,
          productName: product?.name || 'Unknown',
          warehouseId,
          warehouseName: warehouse?.name || 'Unknown',
          severity,
          changePercentage,
          baselineValue: baselineAvg,
          currentValue: recentAvg,
          detectedAt: new Date().toISOString(),
          description: `${type} ${changePercentage > 0 ? 'meningkat' : 'menurun'} ${Math.abs(changePercentage).toFixed(1)}% vs ${lookbackDays} hari sebelumnya`,
          probableCause
        });
      }
    }

    return anomalies.sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }

  async getCriticalAlerts(): Promise<{ summary: AlertSummary; alerts: AnomalyItem[] }> {
    // Aggregate multiple anomaly detection methods
    const [unusualTrx, stockoutHistory, balances, products] = await Promise.all([
      this.detectUnusualTransactions(7, 150),
      this.analyzeStockoutHistory(90),
      database.getInventoryBalances(),
      database.getProducts()
    ]);

    const allAlerts: AnomalyItem[] = [...unusualTrx];

    // Convert stockout history to anomalies
    for (const stockout of stockoutHistory) {
      if (stockout.frequency >= 3) {
        allAlerts.push({
          anomalyId: `stockout-${stockout.productId}-${stockout.warehouseId}`,
          type: 'stockout',
          productId: stockout.productId,
          productName: stockout.productName,
          warehouseId: stockout.warehouseId,
          warehouseName: stockout.warehouseName,
          severity: stockout.frequency >= 5 ? 'critical' : 'high',
          changePercentage: 0,
          baselineValue: stockout.safetyStock,
          currentValue: stockout.currentQty,
          detectedAt: new Date().toISOString(),
          description: `Stockout ${stockout.frequency}x dalam 90 hari terakhir`
        });
      }
    }

    // Optional price variance anomalies
    try {
      if (process.env.PRICE_VARIANCE_ENABLED === '1') {
        const priceAnoms = await this.detectPriceVariance();
        allAlerts.push(...priceAnoms);
      }
    } catch {}

    // Enrich with estimated impact
    const balanceMap = new Map<string, { currentQty: number; safetyStock: number }>();
    for (const b of balances) balanceMap.set(`${b.productId}|${b.warehouseId}`, { currentQty: b.qtyOnHand, safetyStock: b.safetyStock });

    for (const a of allAlerts) {
      const key = `${a.productId}|${a.warehouseId || ''}`;
      const bal = balanceMap.get(key);
      const notes: string[] = [];
      const impact: NonNullable<AnomalyItem['estimatedImpact']> = {};
      const isIssueSpike = a.type === 'unusual_transaction' && a.description.includes('ISSUE') && a.changePercentage > 0;
      const isReceiptSpike = a.type === 'unusual_transaction' && a.description.includes('RECEIPT') && a.changePercentage > 0;
      const recentAvgDaily = a.type === 'unusual_transaction' ? Math.max(0, a.currentValue) : 0;
      if (bal && isIssueSpike && recentAvgDaily > 0) {
        const aboveSafety = Math.max(0, bal.currentQty - bal.safetyStock);
        const days = Math.floor(aboveSafety / recentAvgDaily);
        if (Number.isFinite(days)) impact.stockRiskDays = days;
        if (days <= 7) impact.potentialLostSalesQty = Math.max(0, Math.round(recentAvgDaily * (7 - Math.max(0, days))));
        notes.push('Estimasi risiko stok tipis berdasarkan laju ISSUE 7 hari.');
      }
      if (bal && isReceiptSpike && bal.currentQty > 3 * bal.safetyStock) {
        impact.excessQty = bal.currentQty - 3 * bal.safetyStock;
        notes.push('Potensi overstock: qty saat ini >> safety stock.');
      }
      if (a.type === 'price_variance') notes.push('Variansi harga beli dapat mempengaruhi margin.');
      if (notes.length) a.estimatedImpact = { ...a.estimatedImpact, ...impact, notes: notes.join(' ') };
    }

    // Calculate summary
    const summary: AlertSummary = {
      critical: allAlerts.filter(a => a.severity === 'critical').length,
      high: allAlerts.filter(a => a.severity === 'high').length,
      medium: allAlerts.filter(a => a.severity === 'medium').length,
      low: allAlerts.filter(a => a.severity === 'low').length,
      totalCount: allAlerts.length,
      meta: {
        lowNotEmitted: true,
        lowThresholdNote: 'Low severity is not emitted because unusual_transaction anomalies are only included when abs(changePercentage) >= 150%.'
      }
    };

    // Today priorities (top 3)
    const severityScore = (s: SeverityLevel) => (s === 'critical' ? 3 : s === 'high' ? 2 : s === 'medium' ? 1 : 0);
    const scored = allAlerts.map(a => {
      let score = severityScore(a.severity);
      if (a.probableCause === 'duplicate_entry' || a.probableCause === 'data_error') score += 1;
      if (a.estimatedImpact?.stockRiskDays !== undefined && a.estimatedImpact.stockRiskDays <= 7) score += 1;
      if (a.type === 'stockout') score += 1;
      return { a, score };
    }).sort((x, y) => y.score - x.score);
    summary.todayPriorities = scored.slice(0, 3).map(({ a }) => {
      const title = a.type === 'stockout' ? `Stockout berulang: ${a.productName}` : a.type === 'price_variance' ? `Perubahan biaya: ${a.productName}` : `Anomali ${a.description.split(' ')[0]}: ${a.productName}`;
      const rationaleBits = [
        `Severity ${a.severity}`,
        a.probableCause ? `penyebab: ${a.probableCause.replace('_', ' ')}` : undefined,
        `Δ ${Math.abs(a.changePercentage).toFixed(1)}%`
      ].filter(Boolean);
      const actions: string[] = [];
      if (a.type === 'unusual_transaction') {
        if (a.description.includes('ISSUE')) actions.push('Validasi SO & backlog');
        if (a.description.includes('RECEIPT')) actions.push('Cek penerimaan PO & jadwal supplier');
        actions.push('Audit duplikasi (refId/refType)', 'Lakukan cycle count');
      } else if (a.type === 'stockout') {
        actions.push('Rencanakan replenishment/transfer', 'Komunikasikan ETA ke sales');
      } else if (a.type === 'price_variance') {
        actions.push('Review terms/harga supplier', 'Evaluasi dampak margin');
      }
      let confidence: 'low' | 'medium' | 'high' = 'medium';
      if (a.baselineValue === 0) confidence = 'low';
      if (a.probableCause && a.probableCause !== 'unknown' && (a.severity === 'critical' || a.severity === 'high')) confidence = 'high';
      return {
        productId: a.productId,
        warehouseId: a.warehouseId,
        severity: a.severity,
        title,
        rationale: rationaleBits.join(' • '),
        suggestedActions: actions,
        confidence
      };
    });

    return { summary, alerts: allAlerts };
  }

  // Feature-flagged price variance detection
  async detectPriceVariance(): Promise<AnomalyItem[]> {
    const [poItems, products] = await Promise.all([
      database.getPurchaseOrderItems(),
      database.getProducts()
    ]);
    const now = new Date();
    const d7 = new Date(now); d7.setDate(d7.getDate() - 7);
    const d37 = new Date(d7); d37.setDate(d37.getDate() - 30);
    const byProduct = new Map<string, PurchaseOrderItem[]>();
    for (const it of poItems) {
      if (!byProduct.has(it.productId)) byProduct.set(it.productId, []);
      byProduct.get(it.productId)!.push(it);
    }
    const nameMap = new Map(products.map(p => [p.productId, p.name]));
    const anomalies: AnomalyItem[] = [];
    for (const [productId, list] of byProduct) {
      const recent = list.filter(i => new Date(i.createdAt) >= d7);
      const prior = list.filter(i => new Date(i.createdAt) >= d37 && new Date(i.createdAt) < d7);
      if (recent.length < 3 || prior.length < 3) continue;
      const avg = (arr: PurchaseOrderItem[]) => arr.reduce((s, x) => s + x.unitCost, 0) / arr.length;
      const recentAvg = avg(recent);
      const priorAvg = avg(prior);
      if (priorAvg === 0) continue;
      const changePercentage = ((recentAvg - priorAvg) / priorAvg) * 100;
      const abs = Math.abs(changePercentage);
      let severity: SeverityLevel = 'low';
      if (abs >= 45) severity = 'critical'; else if (abs >= 30) severity = 'high'; else if (abs >= 20) severity = 'medium';
      if (severity === 'low') continue;
      anomalies.push({
        anomalyId: `price-${productId}-${Date.now()}`,
        type: 'price_variance',
        productId,
        productName: nameMap.get(productId) || 'Unknown',
        severity,
        changePercentage,
        baselineValue: priorAvg,
        currentValue: recentAvg,
        detectedAt: new Date().toISOString(),
        description: `Unit cost ${changePercentage > 0 ? 'naik' : 'turun'} ${abs.toFixed(1)}% vs 30 hari sebelum 7 hari terakhir`,
        probableCause: 'process_change',
        estimatedImpact: { notes: 'Variansi harga beli dapat mempengaruhi margin. Tinjau kontrak/terms.' }
      });
    }
    return anomalies;
  }

  async analyzeStockoutHistory(days: number = 90): Promise<StockoutHistoryItem[]> {
    const [transactions, balances, products, warehouses] = await Promise.all([
      database.getInventoryTransactions(),
      database.getInventoryBalances(),
      database.getProducts(),
      database.getWarehouses()
    ]);

    const productMap = new Map(products.map(p => [p.productId, p]));
    const warehouseMap = new Map(warehouses.map(w => [w.warehouseId, w]));

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const stockoutHistory: StockoutHistoryItem[] = [];

    // For each product/warehouse, track when qty went to 0
    for (const balance of balances) {
      const productTrx = transactions
        .filter(t =>
          t.productId === balance.productId &&
          t.warehouseId === balance.warehouseId &&
          new Date(t.trxDate) >= cutoffDate
        )
        .sort((a, b) => new Date(a.trxDate).getTime() - new Date(b.trxDate).getTime());

      let runningQty = balance.qtyOnHand;
      let stockoutDays = 0;
      let stockoutFrequency = 0;
      let lastStockoutDate: Date | null = null;
      let inStockout = runningQty === 0;

      // Simulate backward from current state
      for (let i = productTrx.length - 1; i >= 0; i--) {
        const trx = productTrx[i];
        runningQty -= trx.signedQty; // Reverse transaction

        if (runningQty <= 0 && !inStockout) {
          inStockout = true;
          stockoutFrequency++;
          lastStockoutDate = new Date(trx.trxDate);
        } else if (runningQty > 0 && inStockout) {
          inStockout = false;
        }

        if (runningQty <= 0) {
          stockoutDays++;
        }
      }

      if (stockoutFrequency > 0) {
        const product = productMap.get(balance.productId);
        const warehouse = warehouseMap.get(balance.warehouseId);

        stockoutHistory.push({
          productId: balance.productId,
          productName: product?.name || 'Unknown',
          warehouseId: balance.warehouseId,
          warehouseName: warehouse?.name || 'Unknown',
          stockoutDays,
          frequency: stockoutFrequency,
          lastStockout: lastStockoutDate?.toISOString() || null,
          currentQty: balance.qtyOnHand,
          safetyStock: balance.safetyStock
        });
      }
    }

    return stockoutHistory.sort((a, b) => b.frequency - a.frequency);
  }
}

export default new AnalyticsService();
