import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import {
  fetchSites,
  createSite,
  fetchInventory,
  addInventoryItem,
  uploadInventoryCsv,
  fetchTransfers,
  createTransfer,
  runOptimization,
} from "../../services/warehouseService";
import type { WarehouseSite, InventoryItem, Transfer, OptimizationResult } from "../../components/warehouse/types";

const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

describe("Warehouse Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("fetchSites", () => {
    it("should fetch sites successfully", async () => {
      const mockSites: WarehouseSite[] = [
        { id: 1, code: "WH001", name: "Main Warehouse", active: true },
        { id: 2, code: "WH002", name: "Secondary Warehouse", active: true },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSites),
      } as Response);

      const result = await fetchSites();
      expect(result).toEqual(mockSites);
      expect(mockFetch).toHaveBeenCalledWith("/api/warehouse/sites", {
        credentials: "include",
      });
    });

    it("should throw error when fetch fails", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as Response);

      await expect(fetchSites()).rejects.toThrow("Failed to fetch sites");
    });

    it("should handle network error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      await expect(fetchSites()).rejects.toThrow("Network error");
    });
  });

  describe("createSite", () => {
    it("should create site with valid data", async () => {
      const newSite = { code: "WH003", name: "New Warehouse", city: "San Diego" };
      const createdSite: WarehouseSite = { id: 3, ...newSite, active: true };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createdSite),
      } as Response);

      const result = await createSite(newSite);
      expect(result).toEqual(createdSite);
      expect(mockFetch).toHaveBeenCalledWith("/api/warehouse/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(newSite),
      });
    });

    it("should handle validation errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: "Site code already exists" }),
      } as Response);

      await expect(createSite({ code: "WH001", name: "Duplicate" }))
        .rejects.toThrow("Site code already exists");
    });

    it("should handle missing required fields error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: "Name is required" }),
      } as Response);

      await expect(createSite({ code: "WH004", name: "" }))
        .rejects.toThrow("Name is required");
    });
  });

  describe("fetchInventory", () => {
    it("should fetch inventory for a specific site", async () => {
      const mockInventory: InventoryItem[] = [
        { id: 1, requisition_no: "REQ001", quantity: 10 },
        { id: 2, requisition_no: "REQ002", quantity: 5 },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockInventory),
      } as Response);

      const result = await fetchInventory(1);
      expect(result).toEqual(mockInventory);
      expect(mockFetch).toHaveBeenCalledWith("/api/warehouse/sites/1/inventory", {
        credentials: "include",
      });
    });

    it("should throw error when inventory fetch fails", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      } as Response);

      await expect(fetchInventory(999)).rejects.toThrow("Failed to fetch inventory");
    });
  });

  describe("addInventoryItem", () => {
    it("should add inventory item successfully", async () => {
      const newItem = { requisition_no: "REQ003", quantity: 15, description: "Test Item" };
      const createdItem: InventoryItem = { id: 3, ...newItem };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createdItem),
      } as Response);

      const result = await addInventoryItem(1, newItem);
      expect(result).toEqual(createdItem);
      expect(mockFetch).toHaveBeenCalledWith("/api/warehouse/sites/1/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(newItem),
      });
    });

    it("should handle NSN validation errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: "Invalid NSN format" }),
      } as Response);

      await expect(addInventoryItem(1, { requisition_no: "REQ004", quantity: 1, nsn: "invalid" }))
        .rejects.toThrow("Invalid NSN format");
    });

    it("should handle item creation failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({}),
      } as Response);

      await expect(addInventoryItem(1, { requisition_no: "REQ005", quantity: 1 }))
        .rejects.toThrow("Failed to add item");
    });
  });

  describe("uploadInventoryCsv", () => {
    it("should upload CSV content successfully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ imported: 10 }),
      } as Response);

      await expect(uploadInventoryCsv(1, "header1,header2\nval1,val2")).resolves.not.toThrow();
      expect(mockFetch).toHaveBeenCalledWith("/api/warehouse/sites/1/inventory/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ csv_content: "header1,header2\nval1,val2" }),
      });
    });

    it("should handle CSV upload errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: "Invalid CSV format" }),
      } as Response);

      await expect(uploadInventoryCsv(1, "invalid,csv"))
        .rejects.toThrow("Invalid CSV format");
    });
  });

  describe("fetchTransfers", () => {
    it("should fetch transfers list successfully", async () => {
      const mockTransfers: Transfer[] = [
        { id: 1, source_site_id: 1, destination_site_id: 2, status: "pending", transport_mode: "ground", items: "[]", created_at: "2024-01-01" },
        { id: 2, source_site_id: 2, destination_site_id: 1, status: "in_transit", transport_mode: "air", items: "[]", created_at: "2024-01-02" },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTransfers),
      } as Response);

      const result = await fetchTransfers();
      expect(result).toEqual(mockTransfers);
      expect(mockFetch).toHaveBeenCalledWith("/api/warehouse/transfers", {
        credentials: "include",
      });
    });

    it("should throw error when transfers fetch fails", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as Response);

      await expect(fetchTransfers()).rejects.toThrow("Failed to fetch transfers");
    });
  });

  describe("createTransfer", () => {
    it("should create transfer successfully", async () => {
      const newTransfer = {
        source_site_id: 1,
        destination_site_id: 2,
        transport_mode: "ground",
        items: '[{"id": 1, "quantity": 5}]',
        notes: "Test transfer",
      };
      const createdTransfer: Transfer = { id: 3, ...newTransfer, status: "pending", created_at: "2024-01-03" };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createdTransfer),
      } as Response);

      const result = await createTransfer(newTransfer);
      expect(result).toEqual(createdTransfer);
      expect(mockFetch).toHaveBeenCalledWith("/api/warehouse/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(newTransfer),
      });
    });

    it("should handle transfer creation error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: "Source and destination cannot be the same" }),
      } as Response);

      await expect(createTransfer({
        source_site_id: 1,
        destination_site_id: 1,
        transport_mode: "ground",
        items: "[]",
      })).rejects.toThrow("Source and destination cannot be the same");
    });
  });

  describe("runOptimization", () => {
    it("should run optimization successfully", async () => {
      const mockOptimization: OptimizationResult = {
        site_name: "Main Warehouse",
        recommendations: [
          { type: "placement", message: "Optimize rack layout", priority: "high" },
        ],
        metrics: { total_items: 100, total_value: 50000, aging_alerts: 5 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockOptimization),
      } as Response);

      const result = await runOptimization(1);
      expect(result).toEqual(mockOptimization);
      expect(mockFetch).toHaveBeenCalledWith("/api/warehouse/sites/1/optimization", {
        credentials: "include",
      });
    });

    it("should throw error when optimization fails", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as Response);

      await expect(runOptimization(1)).rejects.toThrow("Failed to run optimization");
    });
  });

  describe("API Error Handling", () => {
    it("should handle server timeout", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Request timed out"));

      await expect(fetchSites()).rejects.toThrow("Request timed out");
    });

    it("should handle malformed JSON response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.reject(new Error("Invalid JSON")),
      } as Response);

      await expect(fetchSites()).rejects.toThrow("Invalid JSON");
    });
  });
});
