import analytics from '../services/analytics';
import { ToolResult } from '../types';

export async function handleToolCall(functionName: string, args: any): Promise<ToolResult> {
  try {
    let data;

    switch (functionName) {
      case 'calculate_total_inventory_value':
        data = await analytics.calculateTotalInventoryValue();
        return {
          success: true,
          data: {
            totalValue: data,
            formatted: `Rp ${data.toLocaleString('id-ID', { minimumFractionDigits: 2 })}`
          }
        };

      case 'get_products_below_safety_stock':
        data = await analytics.getReorderRecommendations();
        const criticalProducts = data.filter(r => r.urgency === 'High');
        return {
          success: true,
          data: {
            count: criticalProducts.length,
            products: criticalProducts
          }
        };

      case 'get_stock_movement_trend':
        data = await analytics.getStockMovementTrend(args.days || 30);
        return {
          success: true,
          data
        };

      case 'get_top_products_by_value':
        data = await analytics.getTopProductsByValue(args.limit || 10);
        return {
          success: true,
          data
        };

      case 'analyze_warehouse_performance':
        data = await analytics.getWarehouseDistribution();
        return {
          success: true,
          data
        };

      case 'get_supplier_performance':
        data = await analytics.getSupplierPerformance();
        return {
          success: true,
          data
        };

      case 'detect_slow_moving_items':
        data = await analytics.getSlowMovingItems(args.days || 90);
        return {
          success: true,
          data: {
            count: data.length,
            items: data
          }
        };

      case 'forecast_reorder_needs':
        data = await analytics.getReorderRecommendations();
        return {
          success: true,
          data: {
            totalRecommendations: data.length,
            highUrgency: data.filter(r => r.urgency === 'High').length,
            mediumUrgency: data.filter(r => r.urgency === 'Medium').length,
            lowUrgency: data.filter(r => r.urgency === 'Low').length,
            recommendations: data
          }
        };

      case 'get_po_delivery_performance':
        data = await analytics.getUpcomingPOs();
        return {
          success: true,
          data: {
            upcomingCount: data.length,
            purchaseOrders: data
          }
        };

      case 'analyze_stock_turnover':
        data = await analytics.getStockTurnover(args.days || 30);
        return {
          success: true,
          data
        };

      case 'get_stock_health_status':
        data = await analytics.getStockHealthStatus();
        return {
          success: true,
          data
        };

      case 'get_inventory_by_category':
        data = await analytics.getInventoryValueByCategory();
        return {
          success: true,
          data
        };

      case 'detect_unusual_transactions':
        data = await analytics.detectUnusualTransactions(
          args.lookbackDays || 7,
          args.thresholdPercentage || 150
        );
        return {
          success: true,
          data: {
            count: data.length,
            criticalCount: data.filter(a => a.severity === 'critical').length,
            highCount: data.filter(a => a.severity === 'high').length,
            anomalies: data
          }
        };

      case 'get_critical_alerts':
        data = await analytics.getCriticalAlerts();
        return {
          success: true,
          data
        };

      case 'analyze_stockout_history':
        data = await analytics.analyzeStockoutHistory(args.days || 90);
        return {
          success: true,
          data: {
            totalProducts: data.length,
            highFrequency: data.filter(s => s.frequency >= 5).length,
            items: data
          }
        };

      default:
        return {
          success: false,
          error: `Unknown function: ${functionName}`
        };
    }
  } catch (error: any) {
    console.error(`Error executing ${functionName}:`, error);
    return {
      success: false,
      error: error.message || 'Unknown error occurred'
    };
  }
}
