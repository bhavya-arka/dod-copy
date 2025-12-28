import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import WMSDashboard from "../../components/warehouse/WMSDashboard";
import WMSInventory from "../../components/warehouse/WMSInventory";
import WMSSitesStorage from "../../components/warehouse/WMSSitesStorage";
import WMSOperations from "../../components/warehouse/WMSOperations";
import WMSAnalytics from "../../components/warehouse/WMSAnalytics";
import WMSAiInsights from "../../components/warehouse/WMSAiInsights";
import WMSAdmin from "../../components/warehouse/WMSAdmin";
import Toast from "../../components/warehouse/Toast";
import type { WarehouseSite, InventoryItem, Transfer } from "../../components/warehouse/types";

jest.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

describe("WMS Components", () => {
  const mockSites: WarehouseSite[] = [
    { id: 1, code: "WH001", name: "Main Warehouse", city: "San Diego", active: true, item_count: 100 },
    { id: 2, code: "WH002", name: "Secondary Warehouse", city: "Los Angeles", active: true, item_count: 50 },
  ];

  const mockInventory: InventoryItem[] = [
    { id: 1, requisition_no: "REQ001", description: "Test Item 1", quantity: 10, condition: "new", nsn: "5340011234567" },
    { id: 2, requisition_no: "REQ002", description: "Test Item 2", quantity: 5, condition: "used" },
  ];

  const mockTransfers: Transfer[] = [
    { id: 1, source_site_id: 1, destination_site_id: 2, status: "pending", transport_mode: "ground", items: "[]", created_at: "2024-01-01" },
    { id: 2, source_site_id: 2, destination_site_id: 1, status: "in_transit", transport_mode: "air", items: "[]", created_at: "2024-01-02" },
  ];

  const mockShowToast = jest.fn();
  const mockTabChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("WMSDashboard", () => {
    const defaultProps = {
      sites: mockSites,
      loading: false,
      totalItems: 150,
      activeTransfers: 2,
      transfers: mockTransfers,
      onAddSite: jest.fn(),
      onRefresh: jest.fn(),
      onTabChange: mockTabChange,
      onShowToast: mockShowToast,
      onOpenCsvUpload: jest.fn(),
    };

    it("should render metrics correctly", () => {
      render(<WMSDashboard {...defaultProps} />);

      expect(screen.getByText("Total Sites")).toBeInTheDocument();
      expect(screen.getByText("Active Shipments")).toBeInTheDocument();
      expect(screen.getByText("Mission Dashboard")).toBeInTheDocument();
    });

    it("should display quick actions", () => {
      render(<WMSDashboard {...defaultProps} />);

      expect(screen.getByText("Quick Actions")).toBeInTheDocument();
      expect(screen.getByText("Import Manifest")).toBeInTheDocument();
      expect(screen.getByText("Run Optimization")).toBeInTheDocument();
      expect(screen.getByText("Generate Load Plan")).toBeInTheDocument();
      expect(screen.getByText("Export Report")).toBeInTheDocument();
    });

    it("should call onOpenCsvUpload when Import Manifest is clicked", () => {
      render(<WMSDashboard {...defaultProps} />);

      fireEvent.click(screen.getByText("Import Manifest"));
      expect(defaultProps.onOpenCsvUpload).toHaveBeenCalled();
    });

    it("should display warehouse sites section", () => {
      render(<WMSDashboard {...defaultProps} />);

      expect(screen.getByText("Warehouse Sites")).toBeInTheDocument();
      expect(screen.getByText("Main Warehouse")).toBeInTheDocument();
    });

    it("should show loading state", () => {
      render(<WMSDashboard {...defaultProps} loading={true} />);

      expect(screen.queryByText("Main Warehouse")).not.toBeInTheDocument();
    });

    it("should show empty state when no sites", () => {
      render(<WMSDashboard {...defaultProps} sites={[]} />);

      expect(screen.getByText("No warehouse sites configured")).toBeInTheDocument();
    });
  });

  describe("WMSInventory", () => {
    const defaultProps = {
      sites: mockSites,
      selectedSiteId: 1,
      onSelectSite: jest.fn(),
      inventory: mockInventory,
      loading: false,
      onOpenCsvUpload: jest.fn(),
      onOpenAddItem: jest.fn(),
      onRefresh: jest.fn(),
      onShowToast: mockShowToast,
    };

    it("should render inventory table", () => {
      render(<WMSInventory {...defaultProps} />);

      expect(screen.getByText("Inventory")).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Search by NSN/i)).toBeInTheDocument();
    });

    it("should display inventory items", () => {
      render(<WMSInventory {...defaultProps} />);

      expect(screen.getByText("REQ001")).toBeInTheDocument();
      expect(screen.getByText("Test Item 1")).toBeInTheDocument();
    });

    it("should filter inventory by search term", () => {
      render(<WMSInventory {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText(/Search by NSN/i);
      fireEvent.change(searchInput, { target: { value: "REQ001" } });

      expect(screen.getByText("REQ001")).toBeInTheDocument();
      expect(screen.queryByText("REQ002")).not.toBeInTheDocument();
    });

    it("should show warning when adding item without site selected", () => {
      render(<WMSInventory {...defaultProps} selectedSiteId={null} />);

      fireEvent.click(screen.getByText("Add Item"));
      expect(mockShowToast).toHaveBeenCalledWith("Please select a warehouse site first", "warning");
    });

    it("should call onOpenAddItem when site is selected", () => {
      render(<WMSInventory {...defaultProps} />);

      fireEvent.click(screen.getByText("Add Item"));
      expect(defaultProps.onOpenAddItem).toHaveBeenCalled();
    });
  });

  describe("WMSSitesStorage", () => {
    const defaultProps = {
      sites: mockSites,
      loading: false,
      onAddSite: jest.fn(),
      onRefresh: jest.fn(),
      onShowToast: mockShowToast,
    };

    it("should render site hierarchy", () => {
      render(<WMSSitesStorage {...defaultProps} />);

      expect(screen.getByText("Sites & Storage")).toBeInTheDocument();
      expect(screen.getByText("Main Warehouse")).toBeInTheDocument();
      expect(screen.getByText("Secondary Warehouse")).toBeInTheDocument();
    });

    it("should show loading state", () => {
      render(<WMSSitesStorage {...defaultProps} loading={true} />);

      expect(screen.queryByText("Main Warehouse")).not.toBeInTheDocument();
    });

    it("should show empty state when no sites", () => {
      render(<WMSSitesStorage {...defaultProps} sites={[]} />);

      expect(screen.getByText("No warehouse sites")).toBeInTheDocument();
    });

    it("should call onAddSite when Add Site button is clicked", () => {
      render(<WMSSitesStorage {...defaultProps} />);

      const addButtons = screen.getAllByText("Add Site");
      fireEvent.click(addButtons[0]);
      expect(defaultProps.onAddSite).toHaveBeenCalled();
    });
  });

  describe("WMSOperations", () => {
    const defaultProps = {
      sites: mockSites,
      transfers: mockTransfers,
      loading: false,
      onOpenTransferForm: jest.fn(),
      onRefresh: jest.fn(),
      onShowToast: mockShowToast,
    };

    it("should render transfers list", () => {
      render(<WMSOperations {...defaultProps} />);

      expect(screen.getByText("Operations")).toBeInTheDocument();
      expect(screen.getByText("Transfer Orders")).toBeInTheDocument();
    });

    it("should display transfer items with correct status", () => {
      render(<WMSOperations {...defaultProps} />);

      expect(screen.getByText("pending")).toBeInTheDocument();
      expect(screen.getByText("in_transit")).toBeInTheDocument();
    });

    it("should show empty state when no transfers", () => {
      render(<WMSOperations {...defaultProps} transfers={[]} />);

      expect(screen.getByText("No transfers")).toBeInTheDocument();
    });

    it("should call onOpenTransferForm when New Transfer is clicked", () => {
      render(<WMSOperations {...defaultProps} />);

      fireEvent.click(screen.getByText("New Transfer"));
      expect(defaultProps.onOpenTransferForm).toHaveBeenCalled();
    });
  });

  describe("WMSAnalytics", () => {
    const defaultProps = {
      sites: mockSites,
      selectedSiteId: 1,
      onSelectSite: jest.fn(),
      onShowToast: mockShowToast,
    };

    it("should render analytics charts section", () => {
      render(<WMSAnalytics {...defaultProps} />);

      expect(screen.getByText("Analytics")).toBeInTheDocument();
      expect(screen.getByText("Mission Readiness")).toBeInTheDocument();
      expect(screen.getByText("Capacity Utilization")).toBeInTheDocument();
      expect(screen.getByText("Aging Summary")).toBeInTheDocument();
    });

    it("should display readiness score", () => {
      render(<WMSAnalytics {...defaultProps} />);

      expect(screen.getByText("87%")).toBeInTheDocument();
    });

    it("should render capacity trendline section", () => {
      render(<WMSAnalytics {...defaultProps} />);

      expect(screen.getByText("Capacity Trendline")).toBeInTheDocument();
      expect(screen.getByText("Aging Curve")).toBeInTheDocument();
    });

    it("should show toast when export is clicked", () => {
      render(<WMSAnalytics {...defaultProps} />);

      fireEvent.click(screen.getByText("Export PDF"));
      expect(mockShowToast).toHaveBeenCalledWith("Export coming soon!", "info");
    });
  });

  describe("WMSAiInsights", () => {
    const defaultProps = {
      sites: mockSites,
      selectedSiteId: null,
      onSelectSite: jest.fn(),
      onShowToast: mockShowToast,
    };

    it("should render insight cards", () => {
      render(<WMSAiInsights {...defaultProps} />);

      expect(screen.getByText("AI Insights")).toBeInTheDocument();
      expect(screen.getByText("Placement Optimization")).toBeInTheDocument();
      expect(screen.getByText("Predictive Load Balancing")).toBeInTheDocument();
      expect(screen.getByText("Aging Alerts")).toBeInTheDocument();
      expect(screen.getByText("Mission Readiness Score")).toBeInTheDocument();
    });

    it("should show optimization section", () => {
      render(<WMSAiInsights {...defaultProps} />);

      expect(screen.getByText("Run Optimization Analysis")).toBeInTheDocument();
      expect(screen.getByText("Run Analysis")).toBeInTheDocument();
    });

    it("should render run analysis button", () => {
      render(<WMSAiInsights {...defaultProps} />);

      const runAnalysisButton = screen.getByText("Run Analysis");
      expect(runAnalysisButton).toBeInTheDocument();
    });
  });

  describe("WMSAdmin", () => {
    const defaultProps = {
      sites: mockSites,
      selectedSiteId: 1,
      onSelectSite: jest.fn(),
      onOpenCsvUpload: jest.fn(),
      onShowToast: mockShowToast,
    };

    it("should render import section", () => {
      render(<WMSAdmin {...defaultProps} />);

      expect(screen.getByText("Admin")).toBeInTheDocument();
      expect(screen.getByText("Data Import")).toBeInTheDocument();
      expect(screen.getByText("Import Inventory CSV")).toBeInTheDocument();
    });

    it("should render configuration section", () => {
      render(<WMSAdmin {...defaultProps} />);

      expect(screen.getByText("Configuration")).toBeInTheDocument();
      expect(screen.getByText("System Settings")).toBeInTheDocument();
      expect(screen.getByText("Aging Thresholds")).toBeInTheDocument();
      expect(screen.getByText("Access Control")).toBeInTheDocument();
    });

    it("should call onOpenCsvUpload when Upload CSV is clicked", () => {
      render(<WMSAdmin {...defaultProps} />);

      fireEvent.click(screen.getByText("Upload CSV"));
      expect(defaultProps.onOpenCsvUpload).toHaveBeenCalled();
    });

    it("should disable upload button when no site selected", () => {
      render(<WMSAdmin {...defaultProps} selectedSiteId={null} />);

      const uploadButton = screen.getByText("Upload CSV");
      expect(uploadButton).toBeDisabled();
    });
  });

  describe("Toast", () => {
    const defaultProps = {
      message: "Test toast message",
      type: "success",
      onDismiss: jest.fn(),
    };

    it("should display toast message correctly", () => {
      render(<Toast {...defaultProps} />);

      expect(screen.getByText("Test toast message")).toBeInTheDocument();
    });

    it("should call onDismiss when close button is clicked", () => {
      render(<Toast {...defaultProps} />);

      const closeButton = screen.getByRole("button");
      fireEvent.click(closeButton);
      expect(defaultProps.onDismiss).toHaveBeenCalled();
    });

    it("should auto-dismiss after timeout", async () => {
      jest.useFakeTimers();
      render(<Toast {...defaultProps} />);

      jest.advanceTimersByTime(4000);
      expect(defaultProps.onDismiss).toHaveBeenCalled();

      jest.useRealTimers();
    });

    it("should apply correct background color for different types", () => {
      const { rerender } = render(<Toast {...defaultProps} type="success" />);
      expect(screen.getByText("Test toast message").parentElement).toHaveClass("bg-[#16A34A]");

      rerender(<Toast {...defaultProps} type="error" />);
      expect(screen.getByText("Test toast message").parentElement).toHaveClass("bg-[#DC2626]");

      rerender(<Toast {...defaultProps} type="warning" />);
      expect(screen.getByText("Test toast message").parentElement).toHaveClass("bg-[#F59E0B]");

      rerender(<Toast {...defaultProps} type="info" />);
      expect(screen.getByText("Test toast message").parentElement).toHaveClass("bg-[#004E89]");
    });
  });
});
