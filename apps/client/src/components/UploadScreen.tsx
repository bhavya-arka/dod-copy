/**
 * PACAF Airlift Demo - Upload Screen
 * Spec Reference: Section 12.1
 *
 * Home screen with movement list upload and aircraft selection.
 * Updated with minimalist glass UI design.
 * Supports CSV, XLSX, and manual entry.
 * Includes mixed fleet optimization controls.
 */

import React, { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AircraftType,
  FleetAvailability,
  FleetTypeAvailability,
  MixedFleetMode,
  AircraftTypeWithProfile,
} from "../lib/pacafTypes";
import * as XLSX from "xlsx";
import ManualCargoEntry, { CargoItem, escapeCSV } from "./ManualCargoEntry";
import { Minus, Plus, Lock, Unlock, ChevronDown, Info, CheckCircle } from "lucide-react";

interface UploadScreenProps {
  onFileUpload: (content: string, filename: string) => void;
  onAircraftSelect: (type: AircraftType) => void;
  selectedAircraft: AircraftType;
  isProcessing: boolean;
  error: string | null;
  onFleetAvailabilityChange?: (availability: FleetAvailability) => void;
}

const MIXED_FLEET_POLICIES: { value: MixedFleetMode; label: string }[] = [
  { value: "PREFERRED_FIRST", label: "Preferred First (Default)" },
  { value: "OPTIMIZE_COST", label: "Optimize Cost" },
  { value: "MIN_AIRCRAFT", label: "Minimize Aircraft" },
  { value: "USER_LOCKED", label: "Only Selected Types" },
];

export default function UploadScreen({
  onFileUpload,
  onAircraftSelect,
  selectedAircraft,
  isProcessing,
  error,
  onFleetAvailabilityChange,
}: UploadScreenProps) {
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [stagedFileContent, setStagedFileContent] = useState<string | null>(null);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [xlsxError, setXlsxError] = useState<string | null>(null);

  const [aircraftTypes, setAircraftTypes] = useState<AircraftTypeWithProfile[]>(
    [],
  );
  const [loadingAircraft, setLoadingAircraft] = useState(true);
  const [aircraftError, setAircraftError] = useState<string | null>(null);

  const [fleetAvailability, setFleetAvailability] = useState<
    FleetTypeAvailability[]
  >([]);
  const [preferredType, setPreferredType] = useState<string | null>(null);
  const [mixedFleetMode, setMixedFleetMode] =
    useState<MixedFleetMode>("PREFERRED_FIRST");
  const [preferenceStrength, setPreferenceStrength] = useState(50);
  const [availabilityError, setAvailabilityError] = useState<string | null>(
    null,
  );

  useEffect(() => {
    const fetchAircraftTypes = async () => {
      try {
        setLoadingAircraft(true);
        setAircraftError(null);

        const response = await fetch("/api/aircraft-types", {
          credentials: "include",
        });

        if (!response.ok) {
          if (response.status === 401) {
            setAircraftTypes([
              {
                id: "C17",
                display_name: "C-17 Globemaster III",
                active: true,
                capacity_model_version: "v1",
                capacityProfile: {
                  id: 1,
                  aircraft_type_id: "C17",
                  version: "v1",
                  max_payload_lb: 170900,
                  max_pallet_positions: 18,
                  cargo_bay_dims: { length: 1056, width: 216, height: 148 },
                  notes: null,
                  default_cost_params: {},
                },
              },
              {
                id: "C130",
                display_name: "C-130H/J Hercules",
                active: true,
                capacity_model_version: "v1",
                capacityProfile: {
                  id: 2,
                  aircraft_type_id: "C130",
                  version: "v1",
                  max_payload_lb: 42000,
                  max_pallet_positions: 6,
                  cargo_bay_dims: { length: 492, width: 123, height: 108 },
                  notes: null,
                  default_cost_params: {},
                },
              },
            ]);
            setLoadingAircraft(false);
            return;
          }
          throw new Error("Failed to fetch aircraft types");
        }

        const data = await response.json();
        setAircraftTypes(data);
      } catch (err) {
        console.error("Error fetching aircraft types:", err);
        setAircraftError(err instanceof Error ? err.message : "Unknown error");
        setAircraftTypes([
          {
            id: "C17",
            display_name: "C-17 Globemaster III",
            active: true,
            capacity_model_version: "v1",
            capacityProfile: {
              id: 1,
              aircraft_type_id: "C17",
              version: "v1",
              max_payload_lb: 170900,
              max_pallet_positions: 18,
              cargo_bay_dims: { length: 1056, width: 216, height: 148 },
              notes: null,
              default_cost_params: {},
            },
          },
          {
            id: "C130",
            display_name: "C-130H/J Hercules",
            active: true,
            capacity_model_version: "v1",
            capacityProfile: {
              id: 2,
              aircraft_type_id: "C130",
              version: "v1",
              max_payload_lb: 42000,
              max_pallet_positions: 6,
              cargo_bay_dims: { length: 492, width: 123, height: 108 },
              notes: null,
              default_cost_params: {},
            },
          },
        ]);
      } finally {
        setLoadingAircraft(false);
      }
    };

    fetchAircraftTypes();
  }, []);

  useEffect(() => {
    if (aircraftTypes.length > 0 && fleetAvailability.length === 0) {
      setFleetAvailability(
        aircraftTypes.map((type) => ({
          typeId: type.id,
          count: 0,
          locked: false,
        })),
      );
    }
  }, [aircraftTypes, fleetAvailability.length]);

  useEffect(() => {
    if (onFleetAvailabilityChange && fleetAvailability.length > 0) {
      onFleetAvailabilityChange({
        types: fleetAvailability,
        preferredType,
        mixedFleetMode,
        preferenceStrength,
      });
    }
  }, [
    fleetAvailability,
    preferredType,
    mixedFleetMode,
    preferenceStrength,
    onFleetAvailabilityChange,
  ]);

  const hasAvailableAircraft = fleetAvailability.some(
    (a) => a.count > 0 && !a.locked,
  );

  const updateAvailability = (
    typeId: string,
    field: "count" | "locked",
    value: number | boolean,
  ) => {
    setFleetAvailability((prev) =>
      prev.map((a) => (a.typeId === typeId ? { ...a, [field]: value } : a)),
    );
    setAvailabilityError(null);
  };

  const incrementCount = (typeId: string) => {
    const current = fleetAvailability.find((a) => a.typeId === typeId);
    if (current) {
      updateAvailability(typeId, "count", current.count + 1);
    }
  };

  const decrementCount = (typeId: string) => {
    const current = fleetAvailability.find((a) => a.typeId === typeId);
    if (current && current.count > 0) {
      updateAvailability(typeId, "count", current.count - 1);
    }
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
        handleFile(e.target.files[0]);
      }
    },
    [],
  );

  const convertXLSXtoCSV = (arrayBuffer: ArrayBuffer): string => {
    const workbook = XLSX.read(arrayBuffer, { type: "array" });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    return XLSX.utils.sheet_to_csv(worksheet);
  };

  const handleFile = (file: File) => {
    setXlsxError(null);
    setAvailabilityError(null);
    const isXLSX = file.name.endsWith(".xlsx") || file.name.endsWith(".xls");

    if (isXLSX) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const arrayBuffer = e.target?.result as ArrayBuffer;
          const csvContent = convertXLSXtoCSV(arrayBuffer);
          if (!csvContent || csvContent.trim().length === 0) {
            setXlsxError(
              "The spreadsheet appears to be empty. Please check the file.",
            );
            return;
          }
          setFileName(file.name.replace(/\.xlsx?$/, ".csv"));
          setStagedFileContent(csvContent);
        } catch (err) {
          console.error("Error converting XLSX:", err);
          setXlsxError(
            `Failed to read spreadsheet: ${err instanceof Error ? err.message : "Unknown error"}. The file may be password-protected or corrupted.`,
          );
        }
      };
      reader.onerror = () => {
        setXlsxError("Failed to read file. Please try again.");
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        setFileName(file.name);
        setStagedFileContent(content);
      };
      reader.readAsText(file);
    }
  };

  const handleConfirm = () => {
    if (!hasAvailableAircraft) {
      setAvailabilityError(
        "Please set at least one aircraft with availability > 0.",
      );
      return;
    }
    if (!stagedFileContent || !fileName) {
      return;
    }
    onFileUpload(stagedFileContent, fileName);
  };

  const isReadyToConfirm = hasAvailableAircraft && stagedFileContent && fileName;

  const handleManualSubmit = (items: CargoItem[]) => {
    if (!hasAvailableAircraft) {
      setAvailabilityError(
        "Please set at least one aircraft with availability > 0 before submitting.",
      );
      return;
    }

    const headers = [
      "Description",
      "Length",
      "Width",
      "Height",
      "Weight",
      "Lead TCN",
      "PAX",
    ];
    const rows = items.map((item) => {
      if (item.isPaxOnly) {
        return [
          escapeCSV(item.description),
          "",
          "",
          "",
          "",
          escapeCSV(item.leadTcn),
          item.pax,
        ];
      }
      return [
        escapeCSV(item.description),
        item.length,
        item.width,
        item.height,
        item.weight,
        escapeCSV(item.leadTcn),
        item.pax || "",
      ];
    });

    const csvContent = [
      headers.join(","),
      ...rows.map((r) => r.join(",")),
    ].join("\n");
    setFileName("manual_entry.csv");
    setShowManualEntry(false);
    onFileUpload(csvContent, "manual_entry.csv");
  };

  const formatWeight = (lbs: number) => {
    return (
      new Intl.NumberFormat("en-US", { style: "decimal" }).format(lbs) + " lb"
    );
  };

  return (
    <div className="h-fit bg-neutral-50 gradient-mesh flex flex-col">
      <header className="p-4 sm:p-6 flex justify-between items-center border-b border-neutral-200/50 shrink-0">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="w-9 h-9 sm:w-10 sm:h-10 bg-primary rounded-xl flex items-center justify-center shadow-soft shrink-0">
            <span className="text-white font-bold text-lg sm:text-xl">A</span>
          </div>
          <div className="min-w-0">
            <h1 className="text-neutral-900 font-bold text-base sm:text-xl truncate">
              Arka Cargo Operations
            </h1>
            <p className="text-neutral-500 text-xs sm:text-sm hidden sm:block">
              Movement Load Planning System
            </p>
          </div>
        </div>
        <div className="badge text-xs">v1.0</div>
      </header>

      <main className="flex-col flex items-start justify-center  py-8 px-4">
        <div className="container mx-auto max-w-7xl flex items-start justify-center">
          <div className="max-w-2xl w-full space-y-6 sm:space-y-8">
            <motion.div
              className="text-center"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-neutral-900 mb-3 sm:mb-4 tracking-tight">
                Upload Movement List
              </h2>
              <p className="text-neutral-500 text-sm sm:text-base lg:text-lg">
                Upload your sanitized UTC dataset to generate optimized load
                plans
              </p>
            </motion.div>

            <motion.div
              className="space-y-3 sm:space-y-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <label className="text-neutral-700 text-sm font-medium">
                Select Aircraft Type
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <button
                  onClick={() => onAircraftSelect("C-17")}
                  className={`glass-card p-4 sm:p-6 text-left transition-all duration-200 ${
                    selectedAircraft === "C-17"
                      ? "ring-2 ring-primary ring-offset-2 shadow-glass-lg"
                      : "hover:shadow-glass-lg hover:-translate-y-0.5"
                  }`}
                >
                  <div className="flex sm:block items-center gap-3 sm:gap-0">
                    <div className="text-2xl sm:text-3xl sm:mb-3">✈️</div>
                    <div>
                      <h3 className="font-bold text-base sm:text-lg text-neutral-900">
                        C-17 Globemaster III
                      </h3>
                      <p className="text-xs sm:text-sm text-neutral-500 mt-0.5 sm:mt-1">
                        18 pallet positions
                      </p>
                      <p className="text-xs sm:text-sm text-neutral-500">
                        170,900 lb payload
                      </p>
                    </div>
                  </div>
                  {selectedAircraft === "C-17" && (
                    <div className="mt-2 sm:mt-3">
                      <span className="badge-primary text-xs">Selected</span>
                    </div>
                  )}
                </button>
                <button
                  onClick={() => onAircraftSelect("C-130")}
                  className={`glass-card p-4 sm:p-6 text-left transition-all duration-200 ${
                    selectedAircraft === "C-130"
                      ? "ring-2 ring-primary ring-offset-2 shadow-glass-lg"
                      : "hover:shadow-glass-lg hover:-translate-y-0.5"
                  }`}
                >
                  <div className="flex sm:block items-center gap-3 sm:gap-0">
                    <div className="text-2xl sm:text-3xl sm:mb-3">🛩️</div>
                    <div>
                      <h3 className="font-bold text-base sm:text-lg text-neutral-900">
                        C-130H/J Hercules
                      </h3>
                      <p className="text-xs sm:text-sm text-neutral-500 mt-0.5 sm:mt-1">
                        6 pallet positions
                      </p>
                      <p className="text-xs sm:text-sm text-neutral-500">
                        42,000 lb payload
                      </p>
                    </div>
                  </div>
                  {selectedAircraft === "C-130" && (
                    <div className="mt-2 sm:mt-3">
                      <span className="badge-primary text-xs">Selected</span>
                    </div>
                  )}
                </button>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <div
                className={`relative glass-card p-8 sm:p-12 text-center transition-all duration-200 ${
                  dragActive
                    ? "ring-2 ring-primary ring-offset-2 bg-primary/5"
                    : fileName
                      ? "ring-2 ring-green-500 ring-offset-2 bg-green-50/50"
                      : "hover:shadow-glass-lg"
                }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <input
                  type="file"
                  accept=".csv,.json,.xlsx,.xls"
                  onChange={handleFileInput}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />

                {fileName ? (
                  <div className="space-y-2 sm:space-y-3">
                    <div className="w-12 h-12 sm:w-16 sm:h-16 mx-auto bg-green-100 rounded-2xl flex items-center justify-center">
                      <span className="text-2xl sm:text-3xl">📄</span>
                    </div>
                    <p className="text-green-700 font-medium text-base sm:text-lg break-all">
                      {fileName}
                    </p>
                    <p className="text-neutral-500 text-xs sm:text-sm">
                      Click or drop to replace
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 sm:space-y-4">
                    <div className="w-12 h-12 sm:w-16 sm:h-16 mx-auto bg-neutral-100 rounded-2xl flex items-center justify-center">
                      <span className="text-2xl sm:text-3xl">📁</span>
                    </div>
                    <div>
                      <p className="text-neutral-900 font-medium text-base sm:text-lg">
                        Drop your movement list here
                      </p>
                      <p className="text-neutral-500 text-xs sm:text-sm mt-1">
                        or click to browse (CSV, XLSX, or JSON)
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>

            <motion.div
              className="space-y-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <div className="flex items-center justify-between">
                <label className="text-neutral-700 text-sm font-medium">
                  Available Aircraft (Required)
                </label>
                {loadingAircraft && (
                  <div className="flex items-center gap-2 text-xs text-neutral-500">
                    <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    Loading...
                  </div>
                )}
              </div>

              <div className="glass-card p-4 sm:p-6 space-y-4">
                <div className="flex items-start gap-2 p-3 bg-blue-50/50 rounded-lg border border-blue-100">
                  <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                  <div className="text-xs text-blue-700 space-y-1">
                    <p>We will not exceed availability counts.</p>
                    <p>
                      If a plan is not feasible, we'll show shortfalls and
                      best-effort allocations.
                    </p>
                  </div>
                </div>

                {aircraftError && (
                  <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                    <p className="text-xs text-amber-700">
                      Using default aircraft types (API unavailable)
                    </p>
                  </div>
                )}

                <div className="space-y-3">
                  {aircraftTypes.map((type) => {
                    const availability = fleetAvailability.find(
                      (a) => a.typeId === type.id,
                    );
                    const count = availability?.count ?? 0;
                    const isLocked = availability?.locked ?? false;
                    const profile = type.capacityProfile;

                    return (
                      <div
                        key={type.id}
                        className={`p-4 rounded-xl border transition-all ${
                          isLocked
                            ? "bg-neutral-100 border-neutral-200 opacity-60"
                            : count > 0
                              ? "bg-green-50/50 border-green-200"
                              : "bg-white border-neutral-200"
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-neutral-900">
                              {type.display_name}
                            </h4>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500 mt-1">
                              {profile && (
                                <>
                                  <span>
                                    Payload:{" "}
                                    {formatWeight(profile.max_payload_lb)}
                                  </span>
                                  {profile.max_pallet_positions && (
                                    <span>
                                      Pallets: {profile.max_pallet_positions}
                                    </span>
                                  )}
                                </>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-3 sm:gap-4">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => decrementCount(type.id)}
                                disabled={count === 0 || isLocked}
                                className="w-8 h-8 flex items-center justify-center rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                              >
                                <Minus className="w-4 h-4" />
                              </button>
                              <input
                                type="number"
                                min="0"
                                value={count}
                                onChange={(e) =>
                                  updateAvailability(
                                    type.id,
                                    "count",
                                    Math.max(0, parseInt(e.target.value) || 0),
                                  )
                                }
                                disabled={isLocked}
                                className="w-16 h-8 text-center border border-neutral-300 rounded-lg text-sm font-medium disabled:bg-neutral-100 disabled:cursor-not-allowed"
                              />
                              <button
                                type="button"
                                onClick={() => incrementCount(type.id)}
                                disabled={isLocked}
                                className="w-8 h-8 flex items-center justify-center rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                            </div>

                            <button
                              type="button"
                              onClick={() =>
                                updateAvailability(type.id, "locked", !isLocked)
                              }
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                isLocked
                                  ? "bg-red-100 text-red-700 hover:bg-red-200"
                                  : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                              }`}
                            >
                              {isLocked ? (
                                <Lock className="w-3 h-3" />
                              ) : (
                                <Unlock className="w-3 h-3" />
                              )}
                              {isLocked ? "Locked" : "Lock"}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {availabilityError && (
                  <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                    <p className="text-xs text-red-700">{availabilityError}</p>
                  </div>
                )}

                <div className="pt-4 border-t border-neutral-200 space-y-4">
                  <h5 className="text-sm font-medium text-neutral-700">
                    Optimization Preferences
                  </h5>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-neutral-600">
                        Preferred Aircraft Type
                      </label>
                      <div className="relative">
                        <select
                          value={preferredType || ""}
                          onChange={(e) =>
                            setPreferredType(e.target.value || null)
                          }
                          className="w-full h-10 px-3 pr-8 border border-neutral-300 rounded-lg text-sm appearance-none bg-white focus:ring-2 focus:ring-primary focus:border-transparent"
                        >
                          <option value="">None</option>
                          {aircraftTypes
                            .filter((t) => t.active)
                            .map((type) => (
                              <option key={type.id} value={type.id}>
                                {type.display_name}
                              </option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-medium text-neutral-600">
                        Mixed Fleet Policy
                      </label>
                      <div className="relative">
                        <select
                          value={mixedFleetMode}
                          onChange={(e) =>
                            setMixedFleetMode(e.target.value as MixedFleetMode)
                          }
                          className="w-full h-10 px-3 pr-8 border border-neutral-300 rounded-lg text-sm appearance-none bg-white focus:ring-2 focus:ring-primary focus:border-transparent"
                        >
                          {MIXED_FLEET_POLICIES.map((policy) => (
                            <option key={policy.value} value={policy.value}>
                              {policy.label}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-neutral-600">
                        Preference Strength
                      </label>
                      <span className="text-xs text-neutral-500">
                        {preferenceStrength}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={preferenceStrength}
                      onChange={(e) =>
                        setPreferenceStrength(parseInt(e.target.value))
                      }
                      className="w-full h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                    <div className="flex justify-between text-xs text-neutral-400">
                      <span>Flexible</span>
                      <span>Strict</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="pt-2"
            >
              <button
                onClick={handleConfirm}
                disabled={!isReadyToConfirm || isProcessing}
                className={`w-full py-4 rounded-xl font-semibold text-lg flex items-center justify-center gap-3 transition-all duration-300 ${
                  isReadyToConfirm && !isProcessing
                    ? "bg-green-600 hover:bg-green-500 text-white shadow-lg hover:shadow-xl hover:-translate-y-0.5"
                    : "bg-neutral-200 text-neutral-400 cursor-not-allowed"
                }`}
              >
                <CheckCircle className={`w-5 h-5 ${isReadyToConfirm ? "text-white" : "text-neutral-400"}`} />
                {isProcessing ? "Processing..." : "Confirm & Generate Load Plan"}
              </button>
              {!isReadyToConfirm && !isProcessing && (
                <p className="text-center text-xs text-neutral-500 mt-2">
                  {!stagedFileContent ? "Upload a file" : ""}
                  {!stagedFileContent && !hasAvailableAircraft ? " and " : ""}
                  {!hasAvailableAircraft ? "set aircraft availability" : ""}
                  {" to continue"}
                </p>
              )}
            </motion.div>

            {(error || xlsxError || availabilityError) && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="glass-card bg-red-50/80 border-red-200 p-4"
              >
                <div className="flex items-start space-x-3">
                  <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <span className="text-red-600">!</span>
                  </div>
                  <div>
                    <h4 className="text-red-800 font-medium">
                      {availabilityError ? "Configuration Required" : "Error Processing File"}
                    </h4>
                    <p className="text-red-600 text-sm mt-1">
                      {error || xlsxError || availabilityError}
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            {isProcessing && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="glass-card p-4 flex items-center justify-center space-x-3"
              >
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-neutral-700 font-medium">
                  Processing movement list...
                </span>
              </motion.div>
            )}

            <div className="text-center space-y-3">
              <p className="text-neutral-400 text-sm">
                Prefer to enter data manually?{" "}
                <button
                  onClick={() => setShowManualEntry(true)}
                  className="text-primary hover:text-primary/80 font-medium transition-colors"
                >
                  Add cargo items manually
                </button>
              </p>
              <p className="text-neutral-400 text-sm">
                Need sample data?{" "}
                <button className="text-primary hover:text-primary/80 font-medium transition-colors">
                  Download template
                </button>
              </p>
            </div>
          </div>
        </div>
      </main>

      <AnimatePresence>
        {showManualEntry && (
          <ManualCargoEntry
            onSubmit={handleManualSubmit}
            onCancel={() => setShowManualEntry(false)}
          />
        )}
      </AnimatePresence>

      <footer className="p-4 border-t border-neutral-200/50 text-center shrink-0">
        <p className="text-neutral-400 text-sm">
          Arka Cargo Operations • For demonstration purposes only
        </p>
      </footer>
    </div>
  );
}
