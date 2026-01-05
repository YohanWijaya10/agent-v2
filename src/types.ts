// Database Models
export interface InventoryTransaction {
  trxId: string;
  trxDate: string;
  warehouseId: string;
  productId: string;
  trxType: 'ISSUE' | 'RECEIPT';
  qty: number;
  signedQty: number;
  refType: string;
  refId: string;
  note?: string;
  createdAt: string;
}

export interface InventoryBalance {
  warehouseId: string;
  productId: string;
  qtyOnHand: number;
  qtyReserved: number;
  safetyStock: number;
  reorderPoint: number;
  updatedAt: string;
}

export type ProductCategory = 'Raw Material' | 'Additive' | 'Packaging' | 'Finished Goods';
export type UOM = 'kg' | 'pcs';

export interface Product {
  productId: string;
  sku: string;
  name: string;
  category: ProductCategory;
  uom: UOM;
  isActive: boolean;
  createdAt: string;
}

export interface PurchaseOrderItem {
  poItemId: string;
  poId: string;
  productId: string;
  qtyOrdered: number;
  unitCost: number;
  qtyReceived: number;
  createdAt: string;
}

export interface PurchaseOrder {
  poId: string;
  supplierId: string;
  poDate: string;
  expectedDate: string;
  status: string;
  currency: string;
  notes?: string;
  items?: PurchaseOrderItem[];
  createdAt: string;
  updatedAt: string;
}

export interface Supplier {
  supplierId: string;
  name: string;
  phone?: string;
  address?: string;
  termsDays: number;
  isActive: boolean;
  createdAt: string;
}

export interface Warehouse {
  warehouseId: string;
  name: string;
  location?: string;
  isActive: boolean;
  createdAt: string;
}

// Dashboard Metrics
export interface DashboardMetrics {
  totalInventoryValue: number;
  totalActiveProducts: number;
  productsBelowSafetyStock: number;
  pendingPOValue: number;
  totalActiveSuppliers: number;
  totalWarehouses: number;
}

export interface InventoryValueByCategory {
  category: ProductCategory;
  value: number;
  percentage: number;
}

export interface StockMovementData {
  date: string;
  receipt: number;
  issue: number;
  net: number;
}

export interface TopProductData {
  productId: string;
  productName: string;
  sku: string;
  value: number;
  qty: number;
}

export interface WarehouseDistributionData {
  warehouseName: string;
  // Dynamic categories from database; keys are category names with numeric values
  [category: string]: string | number;
}

export type StockHealthStatus = 'OK' | 'Warning' | 'Critical';

export interface StockHealthData {
  status: StockHealthStatus;
  count: number;
  percentage: number;
}

export interface UpcomingPOData {
  poId: string;
  supplierName: string;
  expectedDate: string;
  totalValue: number;
  itemCount: number;
  status: string;
}

// Chat Types
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatRequest {
  message: string;
  conversationHistory?: ChatMessage[];
}

export interface ChatResponse {
  response: string;
  suggestions?: string[];
  data?: any;
}

// AI Agent Tool Types
export interface ToolCall {
  name: string;
  arguments: Record<string, any>;
}

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
}

// Analytics Types
export interface SupplierPerformance {
  supplierId: string;
  supplierName: string;
  totalOrders: number;
  onTimeDeliveries: number;
  lateDeliveries: number;
  averageDelayDays: number;
  totalValue: number;
}

export interface SlowMovingItem {
  productId: string;
  productName: string;
  warehouseId: string;
  warehouseName: string;
  qtyOnHand: number;
  lastIssueDate: string | null;
  daysSinceLastIssue: number;
  value: number;
}

export interface ReorderRecommendation {
  productId: string;
  productName: string;
  warehouseId: string;
  warehouseName: string;
  currentQty: number;
  safetyStock: number;
  reorderPoint: number;
  recommendedQty: number;
  urgency: 'High' | 'Medium' | 'Low';
}

export interface StockTurnoverData {
  productId: string;
  productName: string;
  category: ProductCategory;
  totalIssued: number;
  averageOnHand: number;
  turnoverRate: number;
}

export interface ExecutiveSummaryResponse {
  summary: string;
  generatedAt: string;
}

export interface ProductHealthDetail {
  productId: string;
  productName: string;
  warehouseId: string;
  warehouseName: string;
  qtyOnHand: number;
  safetyStock: number;
  reorderPoint: number;
  status: 'Critical' | 'Warning';
  insight?: string;
}

export interface StockHealthDetailsResponse {
  critical: ProductHealthDetail[];
  warning: ProductHealthDetail[];
  generatedAt: string;
  totalCritical: number;
  totalWarning: number;
  warehouseFilter?: string;
}

// Product Performance Analysis Types
export type PerformanceCategory = 'Star' | 'Cash Cow' | 'Question Mark' | 'Dog';

export interface ProductPerformanceData {
  productId: string;
  productName: string;
  sku: string;
  category: ProductCategory;
  turnoverRate: number;
  revenuePotential: number;
  totalIssued30Days: number;
  averageOnHand: number;
  latestUnitCost: number;
  performanceCategory: PerformanceCategory;
  warehouseId?: string;
  warehouseName?: string;
}

export interface PerformanceSummary {
  stars: number;
  cashCows: number;
  questionMarks: number;
  dogs: number;
  medianTurnover: number;
  medianRevenue: number;
}

export interface ProductPerformanceResponse {
  summary: PerformanceSummary;
  products: ProductPerformanceData[];
  topStars: ProductPerformanceData[];
  bottomDogs: ProductPerformanceData[];
  generatedAt: string;
  warehouseFilter?: string;
  categoryFilter?: ProductCategory;
}

export interface ProductPerformanceInsightResponse {
  insights: string;
  topPerformers: string[];
  bottomPerformers: string[];
  recommendations: string[];
  generatedAt: string;
}

// Anomaly Detection Types
export type AnomalyType = 'unusual_transaction' | 'stockout' | 'price_variance';
export type SeverityLevel = 'critical' | 'high' | 'medium' | 'low';
export type ProbableCause = 'demand_spike' | 'receipt_delay' | 'duplicate_entry' | 'process_change' | 'data_error' | 'unknown';

export interface AnomalyItem {
  anomalyId: string;
  type: AnomalyType;
  productId: string;
  productName: string;
  warehouseId?: string;
  warehouseName?: string;
  severity: SeverityLevel;
  changePercentage: number;
  baselineValue: number;
  currentValue: number;
  detectedAt: string;
  description: string;
  insight?: string;
  probableCause?: ProbableCause;
  estimatedImpact?: {
    stockRiskDays?: number;
    excessQty?: number;
    potentialLostSalesQty?: number;
    notes?: string;
  };
}

export interface AlertSummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  totalCount: number;
  meta?: {
    lowNotEmitted: true;
    lowThresholdNote: string;
  };
  todayPriorities?: {
    productId: string;
    warehouseId?: string;
    severity: SeverityLevel;
    title: string;
    rationale: string;
    suggestedActions: string[];
    confidence: 'low' | 'medium' | 'high';
  }[];
}

export interface StockoutHistoryItem {
  productId: string;
  productName: string;
  warehouseId: string;
  warehouseName: string;
  stockoutDays: number;
  frequency: number;
  lastStockout: string | null;
  currentQty: number;
  safetyStock: number;
}

export interface AnomalyDetectionResponse {
  summary: AlertSummary;
  anomalies: AnomalyItem[];
  stockoutHistory: StockoutHistoryItem[];
  generatedAt: string;
}

export interface AnomalyInsightResponse {
  insights: string;
  topCriticalItems: string[];
  recommendations: string[];
  generatedAt: string;
}
