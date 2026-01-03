// DeepSeek Function Calling Tool Definitions
export const tools = [
  {
    type: 'function',
    function: {
      name: 'calculate_total_inventory_value',
      description: 'Menghitung total nilai inventory saat ini (quantity on hand × unit cost)',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_products_below_safety_stock',
      description: 'Mendapatkan daftar produk yang stoknya di bawah safety stock (perlu di-reorder)',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_stock_movement_trend',
      description: 'Mendapatkan trend pergerakan stok (ISSUE vs RECEIPT) dalam beberapa hari terakhir',
      parameters: {
        type: 'object',
        properties: {
          days: {
            type: 'number',
            description: 'Jumlah hari untuk analisis (default: 30)'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_top_products_by_value',
      description: 'Mendapatkan produk dengan nilai inventory tertinggi',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Jumlah produk yang ingin ditampilkan (default: 10)'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'analyze_warehouse_performance',
      description: 'Menganalisis performa dan distribusi stok di setiap gudang',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_supplier_performance',
      description: 'Menganalisis performa supplier (ketepatan waktu pengiriman, total order, dll)',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'detect_slow_moving_items',
      description: 'Mendeteksi produk yang pergerakannya lambat (tidak ada ISSUE dalam periode tertentu)',
      parameters: {
        type: 'object',
        properties: {
          days: {
            type: 'number',
            description: 'Jumlah hari tanpa pergerakan untuk dianggap slow-moving (default: 90)'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'forecast_reorder_needs',
      description: 'Memberikan rekomendasi produk yang perlu di-reorder beserta urgency-nya',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_po_delivery_performance',
      description: 'Mendapatkan daftar Purchase Order yang akan datang beserta expected delivery date',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'analyze_stock_turnover',
      description: 'Menganalisis tingkat perputaran stok (stock turnover rate) untuk setiap produk',
      parameters: {
        type: 'object',
        properties: {
          days: {
            type: 'number',
            description: 'Periode analisis dalam hari (default: 30)'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_stock_health_status',
      description: 'Mendapatkan status kesehatan stok (OK, Warning, Critical) berdasarkan safety stock dan reorder point',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_inventory_by_category',
      description: 'Mendapatkan distribusi nilai inventory berdasarkan kategori produk',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'detect_unusual_transactions',
      description: 'Mendeteksi anomali transaksi ISSUE/RECEIPT yang berubah signifikan (>150%) dibanding rata-rata periode sebelumnya',
      parameters: {
        type: 'object',
        properties: {
          lookbackDays: {
            type: 'number',
            description: 'Jumlah hari untuk baseline comparison (default: 7)'
          },
          thresholdPercentage: {
            type: 'number',
            description: 'Persentase perubahan minimum untuk dianggap anomali (default: 150)'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_critical_alerts',
      description: 'Mendapatkan agregasi semua alert dengan urgency level (critical/high/medium/low) termasuk unusual transactions dan stockout patterns',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'analyze_stockout_history',
      description: 'Melacak riwayat stockout (qty = 0) dalam 90 hari terakhir per produk/gudang untuk identifikasi pola kekurangan stok',
      parameters: {
        type: 'object',
        properties: {
          days: {
            type: 'number',
            description: 'Periode analisis dalam hari (default: 90)'
          }
        },
        required: []
      }
    }
  }
];
