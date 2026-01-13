/**
 * Utility functions for Warehouse Management System
 */

import type { ParsedNSN } from "./types";

/**
 * Parse a National Stock Number (NSN) into FSC and NIIN components
 * @param nsn - The NSN string (13 digits, with or without dashes)
 * @returns Parsed FSC and NIIN, or null if invalid
 */
export function parseNSN(nsn: string): ParsedNSN | null {
  const cleaned = nsn.replace(/[-\s]/g, "");
  if (!/^\d{13}$/.test(cleaned)) return null;
  return {
    fsc: cleaned.substring(0, 4),
    niin: cleaned.substring(4),
  };
}

/**
 * Format an NSN string with standard dashes (XXXX-XX-XXX-XXXX)
 * @param nsn - The raw NSN string
 * @returns Formatted NSN string
 */
export function formatNSN(nsn: string): string {
  const cleaned = nsn.replace(/[-\s]/g, "");
  if (cleaned.length !== 13) return nsn;
  return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 6)}-${cleaned.slice(6, 9)}-${cleaned.slice(9, 13)}`;
}

/**
 * Get the background color class based on toast type
 * @param type - Toast notification type
 * @returns Tailwind CSS class string
 */
export function getToastBgColor(type: string): string {
  switch (type) {
    case "success":
      return "bg-[#16A34A]";
    case "error":
      return "bg-[#DC2626]";
    case "warning":
      return "bg-[#F59E0B]";
    default:
      return "bg-[#2563EB]";
  }
}

/**
 * Get status color classes for transfer status badges
 * @param status - Transfer status string
 * @returns Tailwind CSS class string
 */
export function getStatusColor(status: string): string {
  switch (status?.toLowerCase()) {
    case "completed":
      return "bg-green-100 text-[#16A34A]";
    case "in_transit":
      return "bg-blue-100 text-blue-700";
    case "pending":
      return "bg-amber-100 text-[#F59E0B]";
    case "cancelled":
      return "bg-red-100 text-[#DC2626]";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

/**
 * Get condition badge color classes
 * @param condition - Item condition string
 * @returns Tailwind CSS class string
 */
export function getConditionColor(condition: string): string {
  switch (condition?.toLowerCase()) {
    case "new":
    case "serviceable":
      return "bg-green-100 text-[#16A34A]";
    case "used":
    case "fair":
      return "bg-amber-100 text-[#F59E0B]";
    case "damaged":
    case "unserviceable":
      return "bg-red-100 text-[#DC2626]";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

/**
 * Calculate capacity usage percentage
 * @param itemCount - Number of items
 * @param siteCount - Number of sites
 * @param itemsPerSite - Items per site capacity (default 500)
 * @returns Usage percentage (0-100)
 */
export function calculateCapacityUsage(
  itemCount: number,
  siteCount: number,
  itemsPerSite: number = 500
): number {
  if (siteCount === 0) return 0;
  return Math.min(Math.round((itemCount / (siteCount * itemsPerSite)) * 100), 100);
}

/**
 * Calculate the number of days between two dates
 * @param startDate - Start date string or Date
 * @param endDate - End date string or Date (defaults to now)
 * @returns Number of days (can be negative if endDate is before startDate)
 */
export function getDaysBetween(startDate: string | Date, endDate: string | Date = new Date()): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = end.getTime() - start.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Calculate age of a record in days
 * @param createdAt - Creation date string
 * @returns Number of days since creation
 */
export function getAgeDays(createdAt: string): number {
  return getDaysBetween(createdAt);
}

/**
 * Check if a date is in the past
 * @param dateStr - Date string to check
 * @returns True if date is in the past
 */
export function isOverdue(dateStr: string | undefined): boolean {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date < today;
}

/**
 * Get status banner color classes based on transfer status
 * @param status - Transfer status string
 * @returns Tailwind CSS classes for full-width banner
 */
export function getStatusBannerColor(status: string): string {
  switch (status?.toLowerCase()) {
    case "pending":
      return "bg-gray-100 border-gray-300 text-gray-700";
    case "manifest_created":
      return "bg-blue-100 border-blue-300 text-blue-700";
    case "transport_assigned":
      return "bg-purple-100 border-purple-300 text-purple-700";
    case "in_transit":
      return "bg-yellow-100 border-yellow-300 text-yellow-700";
    case "completed":
      return "bg-green-100 border-green-300 text-green-700";
    case "cancelled":
      return "bg-red-100 border-red-300 text-red-700";
    default:
      return "bg-gray-100 border-gray-300 text-gray-700";
  }
}

/**
 * Get human-readable status label
 * @param status - Transfer status string
 * @returns Formatted status label
 */
export function getStatusLabel(status: string): string {
  switch (status?.toLowerCase()) {
    case "pending":
      return "Pending";
    case "manifest_created":
      return "Manifest Created";
    case "transport_assigned":
      return "Transport Assigned";
    case "in_transit":
      return "In Transit";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    default:
      return status || "Unknown";
  }
}
