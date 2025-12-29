import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import { 
  Package, 
  Search, 
  Filter, 
  Plus, 
  Upload, 
  Loader2, 
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Settings2,
  X,
  Check,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Trash2
} from "lucide-react";
import type { 
  WarehouseSite, 
  InventoryItem, 
  ToastMessage, 
  FilterCondition,
  ColumnConfig,
  FilterOperator,
  PaginatedInventoryResponse
} from "./types";
import { formatNSN, getConditionColor } from "./utils";
import { fetchInventoryPaginated } from "../../services/warehouseService";

const PREFETCH_AHEAD = 5;
const PREFETCH_BEHIND = 2;
const MAX_CACHE_SIZE = 20;

interface WMSInventoryProps {
  sites: WarehouseSite[];
  selectedSiteId: number | null;
  onSelectSite: (id: number | null) => void;
  inventory: InventoryItem[];
  loading: boolean;
  onOpenCsvUpload: () => void;
  onOpenAddItem: () => void;
  onRefresh: () => void;
  onShowToast: (message: string, type?: ToastMessage["type"]) => void;
}

const STORAGE_KEY_COLUMNS = "wms-inventory-columns";
const STORAGE_KEY_PAGE_SIZE = "wms-inventory-page-size";

const DEFAULT_COLUMNS: ColumnConfig[] = [
  { key: "requisition_no", label: "Requisition", visible: true, sortable: true, align: "left" },
  { key: "nsn", label: "NSN", visible: true, sortable: true, align: "left" },
  { key: "description", label: "Description", visible: true, sortable: true, align: "left", width: "200px" },
  { key: "quantity", label: "Qty", visible: true, sortable: true, align: "right" },
  { key: "condition", label: "Condition", visible: true, sortable: true, align: "left" },
  { key: "mission_id", label: "Mission", visible: true, sortable: true, align: "left" },
  { key: "last_moved", label: "Last Moved", visible: true, sortable: true, align: "left" },
  { key: "serial_no", label: "Serial No", visible: false, sortable: true, align: "left" },
  { key: "lin_esd", label: "LIN/ESD", visible: false, sortable: true, align: "left" },
  { key: "unit_price", label: "Unit Price", visible: false, sortable: true, align: "right" },
  { key: "weight_lbs", label: "Weight", visible: false, sortable: true, align: "right" },
];

const FILTER_FIELDS = [
  { key: "requisition_no", label: "Requisition" },
  { key: "nsn", label: "NSN" },
  { key: "niin", label: "NIIN" },
  { key: "fsc", label: "FSC" },
  { key: "description", label: "Description" },
  { key: "quantity", label: "Quantity" },
  { key: "condition", label: "Condition" },
  { key: "mission_id", label: "Mission" },
  { key: "serial_no", label: "Serial No" },
  { key: "lin_esd", label: "LIN/ESD" },
  { key: "unit_price", label: "Unit Price" },
  { key: "weight_lbs", label: "Weight" },
];

const FILTER_OPERATORS: { key: FilterOperator; label: string; requiresValue: boolean }[] = [
  { key: "contains", label: "contains", requiresValue: true },
  { key: "equals", label: "equals", requiresValue: true },
  { key: "not_equals", label: "does not equal", requiresValue: true },
  { key: "greater_than", label: "greater than", requiresValue: true },
  { key: "less_than", label: "less than", requiresValue: true },
  { key: "is_empty", label: "is empty", requiresValue: false },
  { key: "is_not_empty", label: "is not empty", requiresValue: false },
];

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export default function WMSInventory({
  sites,
  selectedSiteId,
  onSelectSite,
  inventory: _legacyInventory,
  loading: externalLoading,
  onOpenCsvUpload,
  onOpenAddItem,
  onRefresh,
  onShowToast,
}: WMSInventoryProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);
  
  const [columns, setColumns] = useState<ColumnConfig[]>(DEFAULT_COLUMNS);
  const [columnsInitialized, setColumnsInitialized] = useState(false);
  
  const [draggedColumnKey, setDraggedColumnKey] = useState<string | null>(null);
  const [dragOverColumnKey, setDragOverColumnKey] = useState<string | null>(null);

  const [filters, setFilters] = useState<FilterCondition[]>([]);
  const [filterLogic, setFilterLogic] = useState<"and" | "or">("and");
  
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [pageSizeInitialized, setPageSizeInitialized] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && !columnsInitialized) {
      const saved = localStorage.getItem(STORAGE_KEY_COLUMNS);
      if (saved) {
        try {
          setColumns(JSON.parse(saved));
        } catch {
        }
      }
      setColumnsInitialized(true);
    }
  }, [columnsInitialized]);

  useEffect(() => {
    if (typeof window !== 'undefined' && !pageSizeInitialized) {
      const saved = localStorage.getItem(STORAGE_KEY_PAGE_SIZE);
      if (saved) {
        setPageSize(parseInt(saved));
      }
      setPageSizeInitialized(true);
    }
  }, [pageSizeInitialized]);
  const [sortBy, setSortBy] = useState("id");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  
  const [paginatedData, setPaginatedData] = useState<PaginatedInventoryResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const filterRef = useRef<HTMLDivElement>(null);
  const columnSettingsRef = useRef<HTMLDivElement>(null);

  const pageCacheRef = useRef<Map<string, PaginatedInventoryResponse>>(new Map());
  const prefetchingRef = useRef<Set<string>>(new Set());
  const cacheVersionRef = useRef(0);
  const cacheOrderRef = useRef<string[]>([]);
  const visitedPagesRef = useRef<Set<number>>(new Set());

  const getCacheKey = useCallback((pageNum: number) => {
    return JSON.stringify({
      siteId: selectedSiteId,
      page: pageNum,
      pageSize,
      sortBy,
      sortOrder,
      search: debouncedSearch,
      filters: filters.length > 0 ? filters : [],
      filterLogic: filters.length > 1 ? filterLogic : "and",
      version: cacheVersionRef.current,
    });
  }, [selectedSiteId, pageSize, sortBy, sortOrder, debouncedSearch, filters, filterLogic]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_COLUMNS, JSON.stringify(columns));
  }, [columns]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PAGE_SIZE, pageSize.toString());
  }, [pageSize]);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  useEffect(() => {
    setPage(1);
    pageCacheRef.current.clear();
    prefetchingRef.current.clear();
    cacheOrderRef.current = [];
    visitedPagesRef.current.clear();
    cacheVersionRef.current += 1;
  }, [debouncedSearch, filters, filterLogic, selectedSiteId, sortBy, sortOrder, pageSize]);

  const addToCache = useCallback((key: string, data: PaginatedInventoryResponse) => {
    const existingIndex = cacheOrderRef.current.indexOf(key);
    if (existingIndex > -1) {
      cacheOrderRef.current.splice(existingIndex, 1);
    }
    
    while (pageCacheRef.current.size >= MAX_CACHE_SIZE && cacheOrderRef.current.length > 0) {
      const oldestKey = cacheOrderRef.current.shift();
      if (oldestKey) {
        pageCacheRef.current.delete(oldestKey);
      }
    }
    
    pageCacheRef.current.set(key, data);
    cacheOrderRef.current.push(key);
  }, []);

  const fetchPageData = useCallback(async (pageNum: number, forPrefetch = false): Promise<PaginatedInventoryResponse | null> => {
    if (!selectedSiteId) return null;
    
    const cacheKey = getCacheKey(pageNum);
    
    if (forPrefetch) {
      const cached = pageCacheRef.current.get(cacheKey);
      if (cached) {
        return cached;
      }
      
      if (prefetchingRef.current.has(cacheKey)) {
        return null;
      }
      
      prefetchingRef.current.add(cacheKey);
    }
    
    try {
      const response = await fetchInventoryPaginated(selectedSiteId, {
        page: pageNum,
        pageSize,
        sortBy,
        sortOrder,
        search: debouncedSearch,
        filters: filters.length > 0 ? filters : undefined,
        filterLogic: filters.length > 1 ? filterLogic : undefined,
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
  }, [selectedSiteId, pageSize, sortBy, sortOrder, debouncedSearch, filters, filterLogic, getCacheKey, addToCache]);

  const fetchData = useCallback(async () => {
    if (!selectedSiteId) return;
    
    const cacheKey = getCacheKey(page);
    const hasVisitedBefore = visitedPagesRef.current.has(page);
    
    if (hasVisitedBefore) {
      const cached = pageCacheRef.current.get(cacheKey);
      if (cached) {
        setPaginatedData(cached);
        return;
      }
    }
    
    setLoading(true);
    try {
      const response = await fetchInventoryPaginated(selectedSiteId, {
        page,
        pageSize,
        sortBy,
        sortOrder,
        search: debouncedSearch,
        filters: filters.length > 0 ? filters : undefined,
        filterLogic: filters.length > 1 ? filterLogic : undefined,
      });
      
      if (response) {
        addToCache(cacheKey, response);
        visitedPagesRef.current.add(page);
        setPaginatedData(response);
      }
    } catch (error) {
      console.error("Failed to fetch inventory:", error);
      onShowToast("Failed to fetch inventory", "error");
    } finally {
      setLoading(false);
    }
  }, [selectedSiteId, page, pageSize, sortBy, sortOrder, debouncedSearch, filters, filterLogic, getCacheKey, addToCache, onShowToast]);

  const prefetchAdjacentPages = useCallback(async () => {
    if (!selectedSiteId || !paginatedData) return;
    
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
      if (!pageCacheRef.current.has(cacheKey) && !prefetchingRef.current.has(cacheKey)) {
        fetchPageData(pageNum, true);
      }
    }
  }, [selectedSiteId, page, paginatedData, getCacheKey, fetchPageData]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setFilterOpen(false);
      }
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
    setColumns(columns.map(col => 
      col.key === key ? { ...col, visible: !col.visible } : col
    ));
  };

  const handleColumnDragStart = (e: React.DragEvent<HTMLTableCellElement>, columnKey: string) => {
    setDraggedColumnKey(columnKey);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", columnKey);
  };

  const handleColumnDragOver = (e: React.DragEvent<HTMLTableCellElement>, columnKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (draggedColumnKey && columnKey !== draggedColumnKey) {
      setDragOverColumnKey(columnKey);
    }
  };

  const handleColumnDragLeave = () => {
    setDragOverColumnKey(null);
  };

  const handleColumnDrop = (e: React.DragEvent<HTMLTableCellElement>, targetColumnKey: string) => {
    e.preventDefault();
    if (!draggedColumnKey || draggedColumnKey === targetColumnKey) {
      setDraggedColumnKey(null);
      setDragOverColumnKey(null);
      return;
    }

    const draggedIndex = columns.findIndex(col => col.key === draggedColumnKey);
    const targetIndex = columns.findIndex(col => col.key === targetColumnKey);

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedColumnKey(null);
      setDragOverColumnKey(null);
      return;
    }

    const newColumns = [...columns];
    const [draggedColumn] = newColumns.splice(draggedIndex, 1);
    newColumns.splice(targetIndex, 0, draggedColumn);

    setColumns(newColumns);
    setDraggedColumnKey(null);
    setDragOverColumnKey(null);
  };

  const handleColumnDragEnd = () => {
    setDraggedColumnKey(null);
    setDragOverColumnKey(null);
  };

  const addFilter = () => {
    setFilters([
      ...filters,
      {
        id: crypto.randomUUID(),
        field: "description",
        operator: "contains",
        value: "",
      }
    ]);
  };

  const updateFilter = (id: string, updates: Partial<FilterCondition>) => {
    setFilters(filters.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  const removeFilter = (id: string) => {
    setFilters(filters.filter(f => f.id !== id));
  };

  const clearFilters = () => {
    setFilters([]);
  };

  const handleAddItem = () => {
    if (!selectedSiteId) {
      onShowToast("Please select a warehouse site first", "warning");
      return;
    }
    onOpenAddItem();
  };

  const handleImport = () => {
    if (!selectedSiteId) {
      onShowToast("Please select a warehouse site first", "warning");
      return;
    }
    onOpenCsvUpload();
  };

  const handleRefresh = () => {
    pageCacheRef.current.clear();
    prefetchingRef.current.clear();
    cacheOrderRef.current = [];
    visitedPagesRef.current.clear();
    cacheVersionRef.current += 1;
    fetchData();
    onRefresh();
  };

  const visibleColumns = useMemo(() => columns.filter(col => col.visible), [columns]);
  const items = paginatedData?.items || [];
  const totalCount = paginatedData?.pagination.totalCount || 0;
  const totalPages = paginatedData?.pagination.totalPages || 0;
  const startItem = totalCount > 0 ? (page - 1) * pageSize + 1 : 0;
  const endItem = Math.min(page * pageSize, totalCount);

  const renderCellValue = (item: InventoryItem, columnKey: string) => {
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
        return (
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getConditionColor(item.condition || "")}`}>
            {item.condition || "-"}
          </span>
        );
      case "mission_id":
        return <span className="text-xs">{item.mission_id || "-"}</span>;
      case "last_moved":
        return <span className="text-xs">{item.last_moved ? new Date(item.last_moved).toLocaleDateString() : "-"}</span>;
      case "serial_no":
        return <span className="text-xs font-mono">{item.serial_no || "-"}</span>;
      case "lin_esd":
        return <span className="text-xs">{item.lin_esd || "-"}</span>;
      case "unit_price":
        return <span className="text-xs">{item.unit_price ? `$${parseFloat(item.unit_price).toFixed(2)}` : "-"}</span>;
      case "weight_lbs":
        return <span className="text-xs">{item.weight_lb || "-"}</span>;
      default:
        return "-";
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

    return pages.map((p, idx) => (
      typeof p === "number" ? (
        <button
          key={idx}
          onClick={() => setPage(p)}
          className={`px-3 py-1 text-sm rounded-lg transition-colors ${
            p === page
              ? "bg-[#004E89] text-white"
              : "hover:bg-muted text-foreground"
          }`}
        >
          {p}
        </button>
      ) : (
        <span key={idx} className="px-2 text-muted-foreground">...</span>
      )
    ));
  };

  return (
    <>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-1">Inventory</h1>
            <p className="text-muted-foreground">Enhanced item tracking and drill-down</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleImport}
              className="text-sm px-3 py-2 rounded-lg border border-border bg-white hover:bg-muted transition-colors flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              Import
            </button>
            <button
              onClick={handleAddItem}
              className="text-sm px-3 py-2 rounded-lg bg-[#004E89] text-white hover:bg-[#003d6d] transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Item
            </button>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-2xl bg-white border border-border shadow-sm p-6"
      >
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <select
            value={selectedSiteId || ""}
            onChange={(e) => onSelectSite(e.target.value ? Number(e.target.value) : null)}
            className="px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:border-[#004E89] focus:ring-1 focus:ring-[#004E89]/40"
          >
            <option value="">Select warehouse site...</option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name} ({site.code})
              </option>
            ))}
          </select>
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by NSN, requisition, description, serial no..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl bg-muted border border-border text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:border-[#004E89] focus:ring-1 focus:ring-[#004E89]/40"
            />
          </div>
          
          <div className="relative" ref={filterRef}>
            <button
              onClick={() => setFilterOpen(!filterOpen)}
              className={`text-sm px-3 py-2 rounded-lg border flex items-center gap-2 transition-colors ${
                filters.length > 0
                  ? "border-[#004E89] bg-[#004E89]/10 text-[#004E89]"
                  : "border-border bg-white hover:bg-muted text-foreground"
              }`}
            >
              <Filter className="w-4 h-4" />
              Filter
              {filters.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-[#004E89] text-white text-xs">{filters.length}</span>
              )}
            </button>
            {filterOpen && (
              <div className="absolute right-0 top-full mt-2 w-[480px] bg-white border border-border rounded-xl shadow-lg p-4 z-20">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-foreground">Advanced Filters</span>
                  {filters.length > 1 && (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground">Match:</span>
                      <button
                        onClick={() => setFilterLogic("and")}
                        className={`px-2 py-1 rounded ${filterLogic === "and" ? "bg-[#004E89] text-white" : "bg-muted text-foreground"}`}
                      >
                        AND
                      </button>
                      <button
                        onClick={() => setFilterLogic("or")}
                        className={`px-2 py-1 rounded ${filterLogic === "or" ? "bg-[#004E89] text-white" : "bg-muted text-foreground"}`}
                      >
                        OR
                      </button>
                    </div>
                  )}
                </div>
                
                <div className="space-y-2 max-h-[300px] overflow-y-auto mb-3">
                  {filters.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">No filters applied. Add a filter to get started.</p>
                  ) : (
                    filters.map((filter) => {
                      const operatorConfig = FILTER_OPERATORS.find(op => op.key === filter.operator);
                      return (
                        <div key={filter.id} className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
                          <select
                            value={filter.field}
                            onChange={(e) => updateFilter(filter.id, { field: e.target.value })}
                            className="px-2 py-1.5 rounded-lg bg-white border border-border text-foreground text-xs min-w-[100px]"
                          >
                            {FILTER_FIELDS.map((f) => (
                              <option key={f.key} value={f.key}>{f.label}</option>
                            ))}
                          </select>
                          <select
                            value={filter.operator}
                            onChange={(e) => updateFilter(filter.id, { operator: e.target.value as FilterOperator })}
                            className="px-2 py-1.5 rounded-lg bg-white border border-border text-foreground text-xs min-w-[120px]"
                          >
                            {FILTER_OPERATORS.map((op) => (
                              <option key={op.key} value={op.key}>{op.label}</option>
                            ))}
                          </select>
                          {operatorConfig?.requiresValue && (
                            <input
                              type="text"
                              value={filter.value}
                              onChange={(e) => updateFilter(filter.id, { value: e.target.value })}
                              placeholder="Value..."
                              className="flex-1 px-2 py-1.5 rounded-lg bg-white border border-border text-foreground text-xs min-w-[80px]"
                            />
                          )}
                          <button
                            onClick={() => removeFilter(filter.id)}
                            className="p-1 text-muted-foreground hover:text-red-500 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-border">
                  <button
                    onClick={addFilter}
                    className="text-sm text-[#004E89] hover:underline flex items-center gap-1"
                  >
                    <Plus className="w-4 h-4" />
                    Add filter
                  </button>
                  {filters.length > 0 && (
                    <button
                      onClick={clearFilters}
                      className="text-sm text-red-500 hover:underline flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      Clear all
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="relative" ref={columnSettingsRef}>
            <button
              onClick={() => setColumnSettingsOpen(!columnSettingsOpen)}
              className="text-sm px-3 py-2 rounded-lg border border-border bg-white hover:bg-muted transition-colors flex items-center gap-2"
            >
              <Settings2 className="w-4 h-4" />
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
                        className="rounded border-border text-[#004E89] focus:ring-[#004E89]"
                      />
                      <span className="text-sm text-foreground">{col.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={handleRefresh}
            disabled={!selectedSiteId || loading}
            className="text-sm px-3 py-2 rounded-lg border border-border bg-white hover:bg-muted transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {!selectedSiteId ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Package className="w-16 h-16 mb-4 opacity-50" />
            <p className="text-lg mb-2">Select a warehouse site</p>
            <p className="text-sm text-muted-foreground/70">Choose a site to view its inventory</p>
          </div>
        ) : loading && items.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-[#004E89]" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Package className="w-16 h-16 mb-4 opacity-50" />
            <p className="text-lg mb-2">No inventory items</p>
            <p className="text-sm text-muted-foreground/70 mb-4">
              {filters.length > 0 || debouncedSearch ? "No items match your filters" : "Import CSV or add items manually"}
            </p>
            {filters.length === 0 && !debouncedSearch && (
              <button
                onClick={handleImport}
                className="text-sm px-4 py-2 rounded-lg bg-[#004E89] text-white hover:bg-[#003d6d] transition-colors flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                Import Inventory
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto relative">
              {loading && (
                <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-10">
                  <Loader2 className="w-6 h-6 animate-spin text-[#004E89]" />
                </div>
              )}
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    {visibleColumns.map((col) => (
                      <th
                        key={col.key}
                        draggable
                        onDragStart={(e) => handleColumnDragStart(e, col.key)}
                        onDragOver={(e) => handleColumnDragOver(e, col.key)}
                        onDragLeave={handleColumnDragLeave}
                        onDrop={(e) => handleColumnDrop(e, col.key)}
                        onDragEnd={handleColumnDragEnd}
                        className={`py-3 px-2 text-xs font-medium text-muted-foreground uppercase hover:bg-muted/50 transition-all select-none ${
                          col.align === "right" ? "text-right" : "text-left"
                        } ${
                          draggedColumnKey === col.key ? "opacity-50 bg-muted cursor-grabbing" : "cursor-grab"
                        } ${
                          dragOverColumnKey === col.key ? "bg-[#004E89]/20 border-l-2 border-[#004E89]" : ""
                        } ${
                          draggedColumnKey && draggedColumnKey !== col.key ? "cursor-grabbing" : ""
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
                    <tr key={item.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
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

            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 pt-4 border-t border-border">
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
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-2 rounded-lg hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                
                <div className="flex items-center gap-1 mx-2">
                  {renderPaginationNumbers()}
                </div>

                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-2 rounded-lg hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPage(totalPages)}
                  disabled={page === totalPages}
                  className="p-2 rounded-lg hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronsRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </motion.div>
    </>
  );
}
