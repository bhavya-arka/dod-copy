/**
 * Editable Spreadsheet Component
 * Provides inline cell editing for cargo manifest and ICODES data.
 * Supports keyboard navigation, multi-select, and Excel-like editing experience.
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Edit2, Save, X, Plus, Trash2, Download, Copy, Table, Grid3X3 } from 'lucide-react';

export interface SpreadsheetColumn {
  key: string;
  label: string;
  width?: number;
  type?: 'text' | 'number' | 'select' | 'checkbox';
  options?: string[];
  editable?: boolean;
  format?: (value: any) => string;
  validate?: (value: any) => boolean;
}

export interface SpreadsheetRow {
  id: string | number;
  [key: string]: any;
}

interface EditableSpreadsheetProps {
  columns: SpreadsheetColumn[];
  data: SpreadsheetRow[];
  onDataChange?: (data: SpreadsheetRow[]) => void;
  onRowAdd?: () => SpreadsheetRow;
  onRowDelete?: (id: string | number) => void;
  title?: string;
  editable?: boolean;
  showToolbar?: boolean;
  showRowNumbers?: boolean;
  stickyHeader?: boolean;
  maxHeight?: string;
  emptyMessage?: string;
}

interface CellPosition {
  rowIndex: number;
  colKey: string;
}

export default function EditableSpreadsheet({
  columns,
  data,
  onDataChange,
  onRowAdd,
  onRowDelete,
  title,
  editable = true,
  showToolbar = true,
  showRowNumbers = true,
  stickyHeader = true,
  maxHeight = '600px',
  emptyMessage = 'No data available'
}: EditableSpreadsheetProps) {
  const [editMode, setEditMode] = useState(false);
  const [editingCell, setEditingCell] = useState<CellPosition | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [localData, setLocalData] = useState<SpreadsheetRow[]>(data);
  const inputRef = useRef<HTMLInputElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLocalData(data);
  }, [data]);

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCell]);

  const getCellKey = (rowIndex: number, colKey: string) => `${rowIndex}-${colKey}`;

  const handleCellClick = useCallback((rowIndex: number, colKey: string, e: React.MouseEvent) => {
    if (!editMode) return;
    
    const column = columns.find(c => c.key === colKey);
    if (column?.editable === false) return;

    const cellKey = getCellKey(rowIndex, colKey);
    
    if (e.ctrlKey || e.metaKey) {
      setSelectedCells(prev => {
        const next = new Set(prev);
        if (next.has(cellKey)) {
          next.delete(cellKey);
        } else {
          next.add(cellKey);
        }
        return next;
      });
    } else if (e.shiftKey && selectedCells.size > 0) {
      // Range selection not implemented yet
    } else {
      setSelectedCells(new Set([cellKey]));
    }
  }, [editMode, columns]);

  const handleCellDoubleClick = useCallback((rowIndex: number, colKey: string) => {
    if (!editMode) return;
    
    const column = columns.find(c => c.key === colKey);
    if (column?.editable === false) return;

    const row = localData[rowIndex];
    const value = row[colKey];
    
    setEditingCell({ rowIndex, colKey });
    setEditValue(value?.toString() ?? '');
  }, [editMode, columns, localData]);

  const handleCellChange = useCallback((value: string) => {
    setEditValue(value);
  }, []);

  const commitEdit = useCallback(() => {
    if (!editingCell) return;

    const { rowIndex, colKey } = editingCell;
    const column = columns.find(c => c.key === colKey);
    
    let newValue: any = editValue;
    
    if (column?.type === 'number') {
      newValue = parseFloat(editValue) || 0;
    }

    if (column?.validate && !column.validate(newValue)) {
      setEditingCell(null);
      return;
    }

    const newData = [...localData];
    newData[rowIndex] = { ...newData[rowIndex], [colKey]: newValue };
    
    setLocalData(newData);
    onDataChange?.(newData);
    setEditingCell(null);
  }, [editingCell, editValue, columns, localData, onDataChange]);

  const cancelEdit = useCallback(() => {
    setEditingCell(null);
    setEditValue('');
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!editingCell) return;

    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        commitEdit();
        break;
      case 'Escape':
        e.preventDefault();
        cancelEdit();
        break;
      case 'Tab':
        e.preventDefault();
        commitEdit();
        
        const currentColIndex = columns.findIndex(c => c.key === editingCell.colKey);
        const editableColumns = columns.filter(c => c.editable !== false);
        
        if (e.shiftKey) {
          const prevEditableIndex = editableColumns.findIndex(c => c.key === editingCell.colKey) - 1;
          if (prevEditableIndex >= 0) {
            handleCellDoubleClick(editingCell.rowIndex, editableColumns[prevEditableIndex].key);
          }
        } else {
          const nextEditableIndex = editableColumns.findIndex(c => c.key === editingCell.colKey) + 1;
          if (nextEditableIndex < editableColumns.length) {
            handleCellDoubleClick(editingCell.rowIndex, editableColumns[nextEditableIndex].key);
          } else if (editingCell.rowIndex < localData.length - 1) {
            handleCellDoubleClick(editingCell.rowIndex + 1, editableColumns[0].key);
          }
        }
        break;
    }
  }, [editingCell, commitEdit, cancelEdit, columns, handleCellDoubleClick, localData.length]);

  const handleAddRow = useCallback(() => {
    if (onRowAdd) {
      const newRow = onRowAdd();
      const newData = [...localData, newRow];
      setLocalData(newData);
      onDataChange?.(newData);
    }
  }, [onRowAdd, localData, onDataChange]);

  const handleDeleteRow = useCallback((id: string | number) => {
    const newData = localData.filter(row => row.id !== id);
    setLocalData(newData);
    onDataChange?.(newData);
    onRowDelete?.(id);
  }, [localData, onDataChange, onRowDelete]);

  const handleCopySelected = useCallback(() => {
    const sortedCells = Array.from(selectedCells).sort((a, b) => {
      const [rowA] = a.split('-').map(Number);
      const [rowB] = b.split('-').map(Number);
      return rowA - rowB;
    });

    const copyText = sortedCells.map(cellKey => {
      const [rowIndex, colKey] = cellKey.split('-');
      return localData[parseInt(rowIndex)]?.[colKey] ?? '';
    }).join('\n');

    navigator.clipboard.writeText(copyText);
  }, [selectedCells, localData]);

  const toggleEditMode = useCallback(() => {
    if (editMode) {
      commitEdit();
    }
    setEditMode(!editMode);
    setSelectedCells(new Set());
  }, [editMode, commitEdit]);

  const formatCellValue = useCallback((value: any, column: SpreadsheetColumn): string => {
    if (value === null || value === undefined) return '-';
    if (column.format) return column.format(value);
    if (column.type === 'number' && typeof value === 'number') {
      return value.toLocaleString();
    }
    return String(value);
  }, []);

  const editableColumnCount = useMemo(() => 
    columns.filter(c => c.editable !== false).length, 
  [columns]);

  return (
    <div className="flex flex-col h-full">
      {showToolbar && (
        <div className="flex items-center justify-between px-4 py-3 bg-neutral-100 border-b border-neutral-200 rounded-t-xl">
          <div className="flex items-center gap-3">
            {title && (
              <h3 className="text-neutral-900 font-bold text-sm">{title}</h3>
            )}
            <span className="text-neutral-500 text-xs">
              {localData.length} rows × {columns.length} columns
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            {editable && (
              <>
                {editMode && selectedCells.size > 0 && (
                  <button
                    onClick={handleCopySelected}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200 rounded-lg transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copy
                  </button>
                )}
                
                {editMode && onRowAdd && (
                  <button
                    onClick={handleAddRow}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-green-600 hover:text-green-700 hover:bg-green-50 rounded-lg transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Row
                  </button>
                )}
                
                <button
                  onClick={toggleEditMode}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                    editMode 
                      ? 'bg-primary text-white hover:bg-primary-dark' 
                      : 'bg-white text-neutral-700 hover:bg-neutral-200 border border-neutral-300'
                  }`}
                >
                  {editMode ? (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      Done
                    </>
                  ) : (
                    <>
                      <Edit2 className="w-3.5 h-3.5" />
                      Edit
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      )}
      
      <div 
        ref={tableRef}
        className="flex-1 overflow-auto"
        style={{ maxHeight }}
      >
        {localData.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-neutral-500 text-sm">
            {emptyMessage}
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead className={stickyHeader ? 'sticky top-0 z-10' : ''}>
              <tr className="bg-neutral-100 border-b border-neutral-200">
                {showRowNumbers && (
                  <th className="px-3 py-2.5 text-left text-neutral-500 font-medium text-xs w-12 bg-neutral-100">
                    #
                  </th>
                )}
                {columns.map(column => (
                  <th 
                    key={column.key}
                    className="px-3 py-2.5 text-left text-neutral-700 font-semibold text-xs bg-neutral-100"
                    style={{ width: column.width ? `${column.width}px` : 'auto' }}
                  >
                    <div className="flex items-center gap-1">
                      {column.label}
                      {column.editable !== false && editMode && (
                        <Edit2 className="w-2.5 h-2.5 text-neutral-400" />
                      )}
                    </div>
                  </th>
                ))}
                {editMode && onRowDelete && (
                  <th className="px-3 py-2.5 text-center text-neutral-500 font-medium text-xs w-12 bg-neutral-100">
                    
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {localData.map((row, rowIndex) => (
                <tr 
                  key={row.id} 
                  className={`hover:bg-neutral-50 transition-colors ${
                    editMode ? 'cursor-cell' : ''
                  }`}
                >
                  {showRowNumbers && (
                    <td className="px-3 py-2 text-neutral-400 text-xs font-mono">
                      {rowIndex + 1}
                    </td>
                  )}
                  {columns.map(column => {
                    const isEditing = editingCell?.rowIndex === rowIndex && editingCell?.colKey === column.key;
                    const isSelected = selectedCells.has(getCellKey(rowIndex, column.key));
                    const isEditable = column.editable !== false;
                    
                    return (
                      <td
                        key={column.key}
                        className={`px-3 py-2 text-sm transition-all ${
                          isSelected && editMode
                            ? 'ring-2 ring-primary ring-inset bg-primary/5'
                            : ''
                        } ${
                          isEditable && editMode
                            ? 'hover:bg-primary/5 cursor-cell'
                            : ''
                        }`}
                        onClick={(e) => handleCellClick(rowIndex, column.key, e)}
                        onDoubleClick={() => handleCellDoubleClick(rowIndex, column.key)}
                      >
                        {isEditing ? (
                          <input
                            ref={inputRef}
                            type={column.type === 'number' ? 'number' : 'text'}
                            value={editValue}
                            onChange={(e) => handleCellChange(e.target.value)}
                            onKeyDown={handleKeyDown}
                            onBlur={commitEdit}
                            className="w-full px-1.5 py-0.5 text-sm bg-white border border-primary rounded focus:outline-none focus:ring-2 focus:ring-primary/30"
                          />
                        ) : (
                          <span className={`${
                            column.type === 'number' ? 'font-mono' : ''
                          } ${
                            !isEditable ? 'text-neutral-500' : 'text-neutral-900'
                          }`}>
                            {formatCellValue(row[column.key], column)}
                          </span>
                        )}
                      </td>
                    );
                  })}
                  {editMode && onRowDelete && (
                    <td className="px-2 py-2 text-center">
                      <button
                        onClick={() => handleDeleteRow(row.id)}
                        className="p-1 text-neutral-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      
      {editMode && (
        <div className="px-4 py-2 bg-blue-50 border-t border-blue-100 text-xs text-blue-700 rounded-b-xl">
          <span className="font-medium">Editing mode:</span> Double-click a cell to edit. Press Enter to save, Escape to cancel, Tab to move to next cell.
        </div>
      )}
    </div>
  );
}
