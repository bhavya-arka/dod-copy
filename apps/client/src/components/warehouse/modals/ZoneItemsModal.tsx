import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  X,
  Settings2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
  Package,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import type {
  ColumnConfig,
  PaginatedInventoryResponse,
  InventoryItem,
} from "../types";
import { formatNSN, getConditionColor } from "../utils";
import {
  fetchInventoryPaginated,
  fetchInventoryColumns,
  InventoryColumnDefinition,
} from "../../../services/warehouseService";

interface ZoneItemsModalProps {
  isOpen: boolean;
  onClose: () => void;
  zone: { id: number; code: string; name: string; site_id: number } | null;
  siteId: number;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const PREFETCH_AHEAD = 2;
const PREFETCH_BEHIND = 1;
const MAX_CACHE_SIZE = 15;
const CACHE_TTL_MS = 60 * 1000;

function convertToColumnConfig(apiColumns: InventoryColumnDefinition[]): ColumnConfig[] {
  return apiColumns.map((col) => ({
    key: col.key,
    label: col.label,
    visible: col.defaultVisible,
    sortable: col.sortable,
    align: col.align,
    width: col.width,
  }));
}

export default function ZoneItemsModal({
  isOpen,
  onClose,
  zone,
  siteId,
}: ZoneItemsModalProps) {
  const [columns, setColumns] = useState<ColumnConfig[]>([]);
  const [columnsLoading, setColumnsLoading] = useState(true);
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortBy, setSortBy] = useState("id");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const [paginatedData, setPaginatedData] = useState<PaginatedInventoryResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const columnSettingsRef = useRef<HTMLDivElement>(null);
  const pageCacheRef = useRef<Map<string, { data: PaginatedInventoryResponse; timestamp: number }>>(new Map());
  const prefetchingRef = useRef<Set<string>>(new Set());
  const cacheVersionRef = useRef(0);
  const visitedPagesRef = useRef<Set<number>>(new Set());


  const getCacheKey = useCallback((pageNum: number) => {
    return JSON.stringify({
      siteId,
      zoneId: zone?.id,
      page: pageNum,
      pageSize,
      sortBy,
      sortOrder,
      version: cacheVersionRef.current,
    });
  }, [siteId, zone?.id, pageSize, sortBy, sortOrder]);

  useEffect(() => {
    if (!isOpen) return;

    const loadColumns = async () => {
      setColumnsLoading(true);
      try {
        const { columns: apiColumns } = await fetchInventoryColumns();
        setColumns(convertToColumnConfig(apiColumns));
      } catch (error) {
        console.error("Failed to fetch column definitions:", error);
        setColumns([]);
      } finally {
        setColumnsLoading(false);
      }
    };

    loadColumns();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setPage(1);
      setPaginatedData(null);
      pageCacheRef.current.clear();
      prefetchingRef.current.clear();
      visitedPagesRef.current.clear();
      cacheVersionRef.current += 1;
    }
  }, [isOpen]);

  useEffect(() => {
    setPage(1);
    pageCacheRef.current.clear();
    prefetchingRef.current.clear();
    visitedPagesRef.current.clear();
    cacheVersionRef.current += 1;
  }, [sortBy, sortOrder, pageSize, zone?.id]);

  const addToCache = useCallback((key: string, data: PaginatedInventoryResponse) => {
    while (pageCacheRef.current.size >= MAX_CACHE_SIZE) {
      const firstKey = pageCacheRef.current.keys().next().value;
      if (firstKey) {
        pageCacheRef.current.delete(firstKey);
      }
    }
    pageCacheRef.current.set(key, { data, timestamp: Date.now() });
  }, []);

  const getFromCache = useCallback((key: string): PaginatedInventoryResponse | null => {
    const entry = pageCacheRef.current.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
      pageCacheRef.current.delete(key);
      return null;
    }

    return entry.data;
  }, []);

  const fetchPageData = useCallback(async (
    pageNum: number,
    forPrefetch = false
  ): Promise<PaginatedInventoryResponse | null> => {
    if (!zone) return null;

    const cacheKey = getCacheKey(pageNum);

    if (forPrefetch) {
      const cached = getFromCache(cacheKey);
      if (cached) return cached;

      if (prefetchingRef.current.has(cacheKey)) return null;
      prefetchingRef.current.add(cacheKey);
    }

    try {
      const response = await fetchInventoryPaginated(siteId, {
        page: pageNum,
        pageSize,
        sortBy,
        sortOrder,
        zone_id: zone.id,
      });

      addToCache(cacheKey, response);
      return response;
    } catch (error) {
      console.error(`Failed to fetch page ${pageNum}:`, error);
      return null;
    } finally {
      if (forPrefetch) {
        prefetchingRef.current.delete(cacheKey);
      }
    }
  }, [zone, siteId, pageSize, sortBy, sortOrder, getCacheKey, addToCache, getFromCache]);

  const fetchData = useCallback(async () => {
    if (!zone || !isOpen) return;

    const cacheKey = getCacheKey(page);
    const hasVisitedBefore = visitedPagesRef.current.has(page);

    if (hasVisitedBefore) {
      const cached = getFromCache(cacheKey);
      if (cached) {
        setPaginatedData(cached);
        return;
      }
    }

    setLoading(true);
    try {
      const response = await fetchInventoryPaginated(siteId, {
        page,
        pageSize,
        sortBy,
        sortOrder,
        zone_id: zone.id,
      });

      if (response) {
        addToCache(cacheKey, response);
        visitedPagesRef.current.add(page);
        setPaginatedData(response);
      }
    } catch (error) {
      console.error("Failed to fetch zone inventory:", error);
    } finally {
      setLoading(false);
    }
  }, [zone, isOpen, page, pageSize, sortBy, sortOrder, siteId, getCacheKey, addToCache, getFromCache]);

  const prefetchAdjacentPages = useCallback(async () => {
    if (!zone || !paginatedData) return;

    const totalPages = paginatedData.pagination.totalPages;
    const pagesToPrefetch: number[] = [];

    for (let i = 1; i <= PREFETCH_AHEAD; i++) {
      const nextPage = page + i;
      if (nextPage <= totalPages) {
        pagesToPrefetch.push(nextPage);
      }
    }

    for (let i = 1; i <= PREFETCH_BEHIND; i++) {
      const prevPage = page - i;
      if (prevPage >= 1) {
        pagesToPrefetch.push(prevPage);
      }
    }

    for (const pageNum of pagesToPrefetch) {
      const cacheKey = getCacheKey(pageNum);
      if (!getFromCache(cacheKey) && !prefetchingRef.current.has(cacheKey)) {
        fetchPageData(pageNum, true);
      }
    }
  }, [zone, page, paginatedData, getCacheKey, fetchPageData, getFromCache]);

  useEffect(() => {
    if (isOpen && zone) {
      fetchData();
    }
  }, [fetchData, isOpen, zone]);

  useEffect(() => {
    if (paginatedData && !loading) {
      const timer = setTimeout(() => {
        prefetchAdjacentPages();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [paginatedData, loading, prefetchAdjacentPages]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (columnSettingsRef.current && !columnSettingsRef.current.contains(event.target as Node)) {
        setColumnSettingsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSort = (columnKey: string) => {
    if (sortBy === columnKey) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(columnKey);
      setSortOrder("asc");
    }
  };

  const toggleColumnVisibility = (key: string) => {
    setColumns(columns.map((col) =>
      col.key === key ? { ...col, visible: !col.visible } : col
    ));
  };

  const visibleColumns = useMemo(() => columns.filter((col) => col.visible), [columns]);
  const items = paginatedData?.items || [];
  const totalCount = paginatedData?.pagination.totalCount || 0;
  const totalPages = paginatedData?.pagination.totalPages || 0;
  const startItem = totalCount > 0 ? (page - 1) * pageSize + 1 : 0;
  const endItem = Math.min(page * pageSize, totalCount);

  const renderCellValue = (item: InventoryItem, columnKey: string) => {
    const value = (item as any)[columnKey];
    switch (columnKey) {
      case "requisition_no":
        return <span className="font-medium">{item.requisition_no || "-"}</span>;
      case "nsn":
        return <span className="font-mono text-muted-foreground">{item.nsn ? formatNSN(item.nsn) : "-"}</span>;
      case "description":
        return <span className="max-w-[200px] truncate block">{item.description || "-"}</span>;
      case "quantity":
        return <span className="font-medium">{item.quantity}</span>;
      case "condition":
      case "condition_code":
        return (
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getConditionColor(value || "")}`}>
            {value || "-"}
          </span>
        );
      case "unit_price":
        return <span className="text-xs">{value ? `$${parseFloat(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "-"}</span>;
      case "weight_lbs":
        return <span className="text-xs">{item.weight_lb || "-"}</span>;
      default:
        return <span className="text-xs">{value ?? "-"}</span>;
    }
  };

  const renderPaginationNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push("...");
      for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
        pages.push(i);
      }
      if (page < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }

    return pages.map((p, idx) =>
      typeof p === "number" ? (
        <button
          key={idx}
          onClick={() => setPage(p)}
          className={`px-3 py-1 text-sm rounded-lg transition-colors ${
            p === page
              ? "bg-[#2563EB] text-white"
              : "hover:bg-muted text-foreground"
          }`}
        >
          {p}
        </button>
      ) : (
        <span key={idx} className="px-2 text-muted-foreground">...</span>
      )
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-6xl mx-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100">
              <Package className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Zone Inventory: {zone?.code}
              </h2>
              <p className="text-sm text-muted-foreground">{zone?.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative" ref={columnSettingsRef}>
              <button
                onClick={() => setColumnSettingsOpen(!columnSettingsOpen)}
                className="text-sm px-3 py-2 rounded-lg border border-border bg-white hover:bg-muted transition-colors flex items-center gap-2"
              >
                <Settings2 className="w-4 h-4" />
                Columns
              </button>
              {columnSettingsOpen && (
                <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-border rounded-xl shadow-lg p-4 z-20">
                  <span className="text-sm font-medium text-foreground block mb-3">Show Columns</span>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {columns.map((col) => (
                      <label
                        key={col.key}
                        className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={col.visible}
                          onChange={() => toggleColumnVisibility(col.key)}
                          className="rounded border-border text-[#2563EB] focus:ring-[#2563EB]"
                        />
                        <span className="text-sm text-foreground">{col.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-muted transition-colors"
            >
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {columnsLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-[#2563EB]" />
            </div>
          ) : loading && items.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-[#2563EB]" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Package className="w-16 h-16 mb-4 opacity-50" />
              <p className="text-lg mb-2">No items in this zone</p>
              <p className="text-sm text-muted-foreground/70">
                This zone currently has no inventory items
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto relative">
              {loading && (
                <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-10">
                  <Loader2 className="w-6 h-6 animate-spin text-[#2563EB]" />
                </div>
              )}
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    {visibleColumns.map((col) => (
                      <th
                        key={col.key}
                        className={`py-3 px-2 text-xs font-medium text-muted-foreground uppercase hover:bg-muted/50 transition-all select-none cursor-pointer ${
                          col.align === "right" ? "text-right" : "text-left"
                        }`}
                        style={{ width: col.width }}
                        onClick={() => col.sortable && handleSort(col.key)}
                      >
                        <div className={`flex items-center gap-1 ${col.align === "right" ? "justify-end" : ""}`}>
                          {col.label}
                          {col.sortable && (
                            sortBy === col.key ? (
                              sortOrder === "asc" ? (
                                <ArrowUp className="w-3 h-3" />
                              ) : (
                                <ArrowDown className="w-3 h-3" />
                              )
                            ) : (
                              <ArrowUpDown className="w-3 h-3 opacity-30" />
                            )
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                    >
                      {visibleColumns.map((col) => (
                        <td
                          key={col.key}
                          className={`py-3 px-2 text-sm ${col.align === "right" ? "text-right" : "text-left"}`}
                        >
                          {renderCellValue(item, col.key)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-t border-border shrink-0">
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>
                Showing {startItem.toLocaleString()}-{endItem.toLocaleString()} of {totalCount.toLocaleString()}
              </span>
              <div className="flex items-center gap-2">
                <span>Per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="px-2 py-1 rounded-lg bg-muted border border-border text-foreground text-sm"
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(1)}
                disabled={page === 1}
                className="p-2 rounded-lg hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronsLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 rounded-lg hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-1 mx-2">
                {renderPaginationNumbers()}
              </div>

              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages || totalPages === 0}
                className="p-2 rounded-lg hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage(totalPages)}
                disabled={page === totalPages || totalPages === 0}
                className="p-2 rounded-lg hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronsRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
