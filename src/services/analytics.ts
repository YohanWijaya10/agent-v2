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
  ProductCategory
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
    return balances.filter(b => b.qtyOnHand < b.safetyStock).length;
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
      if (balance.qtyOnHand < balance.safetyStock) {
        critical++;
      } else if (balance.qtyOnHand < balance.reorderPoint) {
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
      if (balance.qtyOnHand < balance.reorderPoint) {
        const product = productMap.get(balance.productId);
        const warehouse = warehouseMap.get(balance.warehouseId);

        const deficit = balance.reorderPoint - balance.qtyOnHand;
        const recommendedQty = Math.max(deficit, balance.reorderPoint);

        let urgency: 'High' | 'Medium' | 'Low' = 'Low';
        if (balance.qtyOnHand < balance.safetyStock) {
          urgency = 'High';
        } else if (balance.qtyOnHand < balance.reorderPoint * 0.7) {
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
}

export default new AnalyticsService();
