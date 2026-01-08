/**
 * Constants for Warehouse Management System
 */

/** Military minimalism theme colors */
export const WMS_COLORS = {
  navy: "#2563EB",
  navyHover: "#1d4ed8",
  success: "#16A34A",
  warning: "#F59E0B",
  error: "#DC2626",
} as const;

/** Aging threshold configurations in years */
export const AGING_THRESHOLDS = {
  critical: 7,
  warning: 5,
  monitor: 3,
} as const;

/** Aging alert display configuration */
export const AGING_ALERTS = [
  { years: "7+ years", label: "Critical", color: "bg-[#DC2626]" },
  { years: "5-7 years", label: "Warning", color: "bg-[#F59E0B]" },
  { years: "3-5 years", label: "Monitor", color: "bg-yellow-400" },
] as const;

/** Aging summary display configuration */
export const AGING_SUMMARY = [
  { label: "< 1 year", color: "bg-[#16A34A]" },
  { label: "1-3 years", color: "bg-blue-500" },
  { label: "3-5 years", color: "bg-[#F59E0B]" },
  { label: "> 5 years", color: "bg-[#DC2626]" },
] as const;

/** Mock building data for sites storage view */
export const MOCK_BUILDINGS = [
  { code: "B-870", type: "Sprung", dimensions: "90×81×17 ft", capacity: 85, pallets: 120 },
  { code: "B-872", type: "Legacy", dimensions: "90×80×20 ft", capacity: 62, pallets: 150 },
  { code: "B-871", type: "GFM", dimensions: "98×28×30 ft", capacity: 45, pallets: 80 },
] as const;

/** Transport mode options */
export const TRANSPORT_MODES = ["ground", "air", "sea"] as const;
export type TransportMode = (typeof TRANSPORT_MODES)[number];
