import React, { useState, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { Search, ChevronUp, ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type TransportMode = 'air' | 'land' | 'sea';

export interface ColumnDef<T> {
  id: string;
  header: string;
  accessorKey?: keyof T;
  accessorFn?: (row: T) => React.ReactNode;
  sortable?: boolean;
  className?: string;
}

export interface TransportTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  mode: TransportMode;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  emptyMessage?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
}

const modeConfig: Record<TransportMode, {
  headerBg: string;
  hoverBg: string;
  accentBorder: string;
  searchFocus: string;
  accentColor: string;
}> = {
  air: {
    headerBg: 'bg-white',
    hoverBg: 'hover:bg-gray-100',
    accentBorder: 'border-l-blue-500',
    searchFocus: 'focus:ring-blue-500/50 focus:border-blue-500',
    accentColor: 'text-blue-400',
  },
  land: {
    headerBg: 'bg-white',
    hoverBg: 'hover:bg-gray-100',
    accentBorder: 'border-l-amber-500',
    searchFocus: 'focus:ring-amber-500/50 focus:border-amber-500',
    accentColor: 'text-amber-400',
  },
  sea: {
    headerBg: 'bg-white',
    hoverBg: 'hover:bg-gray-100',
    accentBorder: 'border-l-teal-500',
    searchFocus: 'focus:ring-teal-500/50 focus:border-teal-500',
    accentColor: 'text-teal-400',
  },
};

function TableSkeleton({ columns, rows = 5 }: { columns: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-b border-gray-200">
          {Array.from({ length: columns }).map((_, j) => (
            <td key={j} className="p-4">
              <div className="h-4 bg-gray-200 rounded animate-pulse" style={{ width: `${60 + Math.random() * 30}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function TransportTableInner<T extends { id?: number | string }>({
  data,
  columns,
  mode,
  onRowClick,
  loading = false,
  emptyMessage = 'No data available',
  searchable = false,
  searchPlaceholder = 'Search...',
}: TransportTableProps<T>) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const config = modeConfig[mode];

  const filteredData = useMemo(() => {
    if (!searchTerm.trim()) return data;
    
    const term = searchTerm.toLowerCase();
    return data.filter((row) => {
      return columns.some((col) => {
        const value = col.accessorKey ? row[col.accessorKey] : col.accessorFn?.(row);
        if (value === null || value === undefined) return false;
        return String(value).toLowerCase().includes(term);
      });
    });
  }, [data, searchTerm, columns]);

  const sortedData = useMemo(() => {
    if (!sortColumn) return filteredData;

    const col = columns.find((c) => c.id === sortColumn);
    if (!col || !col.accessorKey) return filteredData;

    return [...filteredData].sort((a, b) => {
      const aVal = a[col.accessorKey as keyof T];
      const bVal = b[col.accessorKey as keyof T];

      if (aVal === bVal) return 0;
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      const comparison = aVal < bVal ? -1 : 1;
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredData, sortColumn, sortDirection, columns]);

  const handleSort = useCallback((columnId: string) => {
    const col = columns.find((c) => c.id === columnId);
    if (!col?.sortable) return;

    if (sortColumn === columnId) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(columnId);
      setSortDirection('asc');
    }
  }, [sortColumn, columns]);

  const getCellValue = useCallback((row: T, col: ColumnDef<T>): React.ReactNode => {
    if (col.accessorFn) return col.accessorFn(row);
    if (col.accessorKey) return row[col.accessorKey] as React.ReactNode;
    return null;
  }, []);

  return (
    <div className="rounded-2xl bg-white border border-gray-200 overflow-hidden">
      {searchable && (
        <div className="p-4 border-b border-gray-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={searchPlaceholder}
              className={cn(
                'w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl',
                'text-gray-900 placeholder:text-gray-500 text-sm',
                'focus:outline-none focus:ring-2 transition-all',
                config.searchFocus
              )}
            />
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className={config.headerBg}>
              {columns.map((col) => (
                <th
                  key={col.id}
                  className={cn(
                    'px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider',
                    col.sortable && 'cursor-pointer select-none hover:bg-gray-100 transition-colors',
                    col.className
                  )}
                  onClick={() => col.sortable && handleSort(col.id)}
                >
                  <div className="flex items-center gap-1">
                    {col.header}
                    {col.sortable && sortColumn === col.id && (
                      sortDirection === 'asc' 
                        ? <ChevronUp className="w-3.5 h-3.5" />
                        : <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableSkeleton columns={columns.length} />
            ) : sortedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="w-8 h-8 text-gray-400" />
                    <p className="text-gray-500">{emptyMessage}</p>
                  </div>
                </td>
              </tr>
            ) : (
              sortedData.map((row, index) => (
                <motion.tr
                  key={row.id ?? index}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.02 }}
                  onClick={() => onRowClick?.(row)}
                  className={cn(
                    'border-b border-gray-200 transition-colors',
                    config.hoverBg,
                    onRowClick && 'cursor-pointer',
                    `border-l-2 border-l-transparent hover:${config.accentBorder}`
                  )}
                >
                  {columns.map((col) => (
                    <td
                      key={col.id}
                      className={cn('px-4 py-3 text-sm text-gray-700', col.className)}
                    >
                      {getCellValue(row, col)}
                    </td>
                  ))}
                </motion.tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!loading && sortedData.length > 0 && (
        <div className="px-4 py-3 border-t border-gray-200 text-xs text-gray-500">
          Showing {sortedData.length} of {data.length} entries
        </div>
      )}
    </div>
  );
}

export const TransportTable = React.memo(TransportTableInner) as typeof TransportTableInner;
