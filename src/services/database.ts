import axios, { AxiosInstance } from 'axios';
import {
  InventoryTransaction,
  InventoryBalance,
  Product,
  PurchaseOrder,
  PurchaseOrderItem,
  Supplier,
  Warehouse
} from '../types';

class DatabaseService {
  private client: AxiosInstance;
  private baseURL: string;

  constructor() {
    this.baseURL = process.env.DATABASE_API_URL || 'https://serverless-twg8.vercel.app';
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  async getInventoryTransactions(): Promise<InventoryTransaction[]> {
    try {
      const response = await this.client.get<InventoryTransaction[]>('/api/inventorytransaction');
      // API returns numeric values as strings, need to parse them
      return response.data.map(trx => ({
        ...trx,
        qty: Number(trx.qty),
        signedQty: Number(trx.signedQty)
      }));
    } catch (error) {
      console.error('Error fetching inventory transactions:', error);
      throw error;
    }
  }

  async getInventoryBalances(): Promise<InventoryBalance[]> {
    try {
      const response = await this.client.get<InventoryBalance[]>('/api/inventorybalance');
      // API returns numeric values as strings, need to parse them
      return response.data.map(balance => ({
        ...balance,
        qtyOnHand: Number(balance.qtyOnHand),
        qtyReserved: Number(balance.qtyReserved),
        safetyStock: Number(balance.safetyStock),
        reorderPoint: Number(balance.reorderPoint)
      }));
    } catch (error) {
      console.error('Error fetching inventory balances:', error);
      throw error;
    }
  }

  async getProducts(): Promise<Product[]> {
    try {
      const response = await this.client.get<Product[]>('/api/products');
      return response.data;
    } catch (error) {
      console.error('Error fetching products:', error);
      throw error;
    }
  }

  async getPurchaseOrders(): Promise<PurchaseOrder[]> {
    try {
      const response = await this.client.get<PurchaseOrder[]>('/api/purchaseorder');
      return response.data;
    } catch (error) {
      console.error('Error fetching purchase orders:', error);
      throw error;
    }
  }

  async getPurchaseOrderItems(): Promise<PurchaseOrderItem[]> {
    try {
      const response = await this.client.get<PurchaseOrderItem[]>('/api/purchaseorderitem');
      // API returns numeric values as strings, need to parse them
      return response.data.map(item => ({
        ...item,
        qtyOrdered: Number(item.qtyOrdered),
        unitCost: Number(item.unitCost),
        qtyReceived: Number(item.qtyReceived)
      }));
    } catch (error) {
      console.error('Error fetching purchase order items:', error);
      throw error;
    }
  }

  async getSuppliers(): Promise<Supplier[]> {
    try {
      const response = await this.client.get<Supplier[]>('/api/suppliers');
      // API returns numeric values as strings, need to parse them
      return response.data.map(supplier => ({
        ...supplier,
        termsDays: Number(supplier.termsDays)
      }));
    } catch (error) {
      console.error('Error fetching suppliers:', error);
      throw error;
    }
  }

  async getWarehouses(): Promise<Warehouse[]> {
    try {
      const response = await this.client.get<Warehouse[]>('/api/warehouses');
      return response.data;
    } catch (error) {
      console.error('Error fetching warehouses:', error);
      throw error;
    }
  }

  // Combined fetch for efficiency
  async getAllData() {
    try {
      const [
        transactions,
        balances,
        products,
        purchaseOrders,
        purchaseOrderItems,
        suppliers,
        warehouses
      ] = await Promise.all([
        this.getInventoryTransactions(),
        this.getInventoryBalances(),
        this.getProducts(),
        this.getPurchaseOrders(),
        this.getPurchaseOrderItems(),
        this.getSuppliers(),
        this.getWarehouses()
      ]);

      return {
        transactions,
        balances,
        products,
        purchaseOrders,
        purchaseOrderItems,
        suppliers,
        warehouses
      };
    } catch (error) {
      console.error('Error fetching all data:', error);
      throw error;
    }
  }
}

export default new DatabaseService();
