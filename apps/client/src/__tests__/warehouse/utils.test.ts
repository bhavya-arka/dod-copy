import { describe, it, expect } from '@jest/globals';
import {
  parseNSN,
  formatNSN,
  getToastBgColor,
  getStatusColor,
  getConditionColor,
  calculateCapacityUsage,
} from "../../components/warehouse/utils";

describe("Warehouse Utils", () => {
  describe("parseNSN", () => {
    it("should parse valid NSN format with dashes", () => {
      const result = parseNSN("5340-01-123-4567");
      expect(result).not.toBeNull();
      expect(result?.fsc).toBe("5340");
      expect(result?.niin).toBe("011234567");
    });

    it("should parse valid NSN format without dashes", () => {
      const result = parseNSN("5340011234567");
      expect(result).not.toBeNull();
      expect(result?.fsc).toBe("5340");
      expect(result?.niin).toBe("011234567");
    });

    it("should return null for invalid format - too short", () => {
      const result = parseNSN("5340011234");
      expect(result).toBeNull();
    });

    it("should return null for invalid format - too long", () => {
      const result = parseNSN("53400112345678");
      expect(result).toBeNull();
    });

    it("should return null for invalid format - non-numeric characters", () => {
      const result = parseNSN("5340-AB-123-4567");
      expect(result).toBeNull();
    });

    it("should extract FSC correctly (first 4 digits)", () => {
      const result = parseNSN("1234567890123");
      expect(result?.fsc).toBe("1234");
    });

    it("should extract NIIN correctly (remaining 9 digits)", () => {
      const result = parseNSN("1234567890123");
      expect(result?.niin).toBe("567890123");
    });

    it("should handle NSN with spaces", () => {
      const result = parseNSN("5340 01 123 4567");
      expect(result).not.toBeNull();
      expect(result?.fsc).toBe("5340");
    });
  });

  describe("formatNSN", () => {
    it("should format NSN correctly with dashes", () => {
      const result = formatNSN("5340011234567");
      expect(result).toBe("5340-01-123-4567");
    });

    it("should handle already formatted NSN", () => {
      const result = formatNSN("5340-01-123-4567");
      expect(result).toBe("5340-01-123-4567");
    });

    it("should return original string if length is not 13 after cleaning", () => {
      const result = formatNSN("534001");
      expect(result).toBe("534001");
    });

    it("should handle empty string", () => {
      const result = formatNSN("");
      expect(result).toBe("");
    });

    it("should handle NSN with extra spaces", () => {
      const result = formatNSN(" 5340 01 123 4567 ");
      expect(result).toBe("5340-01-123-4567");
    });
  });

  describe("getToastBgColor", () => {
    it("should return correct color for success type", () => {
      expect(getToastBgColor("success")).toBe("bg-[#16A34A]");
    });

    it("should return correct color for error type", () => {
      expect(getToastBgColor("error")).toBe("bg-[#DC2626]");
    });

    it("should return correct color for warning type", () => {
      expect(getToastBgColor("warning")).toBe("bg-[#F59E0B]");
    });

    it("should return default color for info type", () => {
      expect(getToastBgColor("info")).toBe("bg-[#004E89]");
    });

    it("should return default color for unknown type", () => {
      expect(getToastBgColor("unknown")).toBe("bg-[#004E89]");
    });
  });

  describe("getStatusColor", () => {
    it("should return correct classes for completed status", () => {
      expect(getStatusColor("completed")).toBe("bg-green-100 text-[#16A34A]");
    });

    it("should return correct classes for in_transit status", () => {
      expect(getStatusColor("in_transit")).toBe("bg-blue-100 text-blue-700");
    });

    it("should return correct classes for pending status", () => {
      expect(getStatusColor("pending")).toBe("bg-amber-100 text-[#F59E0B]");
    });

    it("should return correct classes for cancelled status", () => {
      expect(getStatusColor("cancelled")).toBe("bg-red-100 text-[#DC2626]");
    });

    it("should return default classes for unknown status", () => {
      expect(getStatusColor("unknown")).toBe("bg-gray-100 text-gray-700");
    });

    it("should handle case-insensitive status", () => {
      expect(getStatusColor("COMPLETED")).toBe("bg-green-100 text-[#16A34A]");
      expect(getStatusColor("In_Transit")).toBe("bg-blue-100 text-blue-700");
    });
  });

  describe("getConditionColor", () => {
    it("should return correct classes for new condition", () => {
      expect(getConditionColor("new")).toBe("bg-green-100 text-[#16A34A]");
    });

    it("should return correct classes for serviceable condition", () => {
      expect(getConditionColor("serviceable")).toBe("bg-green-100 text-[#16A34A]");
    });

    it("should return correct classes for used condition", () => {
      expect(getConditionColor("used")).toBe("bg-amber-100 text-[#F59E0B]");
    });

    it("should return correct classes for fair condition", () => {
      expect(getConditionColor("fair")).toBe("bg-amber-100 text-[#F59E0B]");
    });

    it("should return correct classes for damaged condition", () => {
      expect(getConditionColor("damaged")).toBe("bg-red-100 text-[#DC2626]");
    });

    it("should return correct classes for unserviceable condition", () => {
      expect(getConditionColor("unserviceable")).toBe("bg-red-100 text-[#DC2626]");
    });

    it("should return default classes for unknown condition", () => {
      expect(getConditionColor("unknown")).toBe("bg-gray-100 text-gray-700");
    });

    it("should handle case-insensitive condition", () => {
      expect(getConditionColor("NEW")).toBe("bg-green-100 text-[#16A34A]");
      expect(getConditionColor("DAMAGED")).toBe("bg-red-100 text-[#DC2626]");
    });
  });

  describe("calculateCapacityUsage", () => {
    it("should calculate correct percentage for normal usage", () => {
      const result = calculateCapacityUsage(250, 1, 500);
      expect(result).toBe(50);
    });

    it("should return 0 when site count is 0", () => {
      const result = calculateCapacityUsage(100, 0, 500);
      expect(result).toBe(0);
    });

    it("should cap at 100% for over-capacity", () => {
      const result = calculateCapacityUsage(600, 1, 500);
      expect(result).toBe(100);
    });

    it("should use default items per site when not provided", () => {
      const result = calculateCapacityUsage(250, 1);
      expect(result).toBe(50);
    });

    it("should calculate correctly for multiple sites", () => {
      const result = calculateCapacityUsage(500, 2, 500);
      expect(result).toBe(50);
    });

    it("should round to nearest integer", () => {
      const result = calculateCapacityUsage(333, 1, 500);
      expect(result).toBe(67);
    });

    it("should return 0 for zero items", () => {
      const result = calculateCapacityUsage(0, 5, 500);
      expect(result).toBe(0);
    });
  });
});
