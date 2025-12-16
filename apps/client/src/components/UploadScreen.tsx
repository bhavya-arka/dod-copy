/**
 * PACAF Airlift Demo - Upload Screen
 * Spec Reference: Section 12.1
 * 
 * Home screen with movement list upload and aircraft selection.
 * Updated with minimalist glass UI design.
 * Supports CSV, XLSX, and manual entry.
 */

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AircraftType } from '../lib/pacafTypes';
import * as XLSX from 'xlsx';
import ManualCargoEntry, { CargoItem, escapeCSV } from './ManualCargoEntry';

interface UploadScreenProps {
  onFileUpload: (content: string, filename: string) => void;
  onAircraftSelect: (type: AircraftType) => void;
  selectedAircraft: AircraftType;
  isProcessing: boolean;
  error: string | null;
}

export default function UploadScreen({
  onFileUpload,
  onAircraftSelect,
  selectedAircraft,
  isProcessing,
  error
}: UploadScreenProps) {
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [xlsxError, setXlsxError] = useState<string | null>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
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

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  }, []);

  const convertXLSXtoCSV = (arrayBuffer: ArrayBuffer): string => {
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    return XLSX.utils.sheet_to_csv(worksheet);
  };

  const handleFile = (file: File) => {
    setXlsxError(null);
    const isXLSX = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    
    if (isXLSX) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const arrayBuffer = e.target?.result as ArrayBuffer;
          const csvContent = convertXLSXtoCSV(arrayBuffer);
          if (!csvContent || csvContent.trim().length === 0) {
            setXlsxError('The spreadsheet appears to be empty. Please check the file.');
            return;
          }
          setFileName(file.name);
          onFileUpload(csvContent, file.name.replace(/\.xlsx?$/, '.csv'));
        } catch (err) {
          console.error('Error converting XLSX:', err);
          setXlsxError(`Failed to read spreadsheet: ${err instanceof Error ? err.message : 'Unknown error'}. The file may be password-protected or corrupted.`);
        }
      };
      reader.onerror = () => {
        setXlsxError('Failed to read file. Please try again.');
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        setFileName(file.name);
        onFileUpload(content, file.name);
      };
      reader.readAsText(file);
    }
  };

  const handleManualSubmit = (items: CargoItem[]) => {
    const headers = ['Description', 'Length', 'Width', 'Height', 'Weight', 'Lead TCN', 'PAX'];
    const rows = items.map(item => {
      if (item.isPaxOnly) {
        return [
          escapeCSV(item.description),
          '',
          '',
          '',
          '',
          escapeCSV(item.leadTcn),
          item.pax
        ];
      }
      return [
        escapeCSV(item.description),
        item.length,
        item.width,
        item.height,
        item.weight,
        escapeCSV(item.leadTcn),
        item.pax || ''
      ];
    });
    
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    setFileName('manual_entry.csv');
    setShowManualEntry(false);
    onFileUpload(csvContent, 'manual_entry.csv');
  };

  return (
    <div className="min-h-screen bg-neutral-50 gradient-mesh flex flex-col overflow-auto">
      <header className="p-4 sm:p-6 flex justify-between items-center border-b border-neutral-200/50">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="w-9 h-9 sm:w-10 sm:h-10 bg-primary rounded-xl flex items-center justify-center shadow-soft shrink-0">
            <span className="text-white font-bold text-lg sm:text-xl">A</span>
          </div>
          <div className="min-w-0">
            <h1 className="text-neutral-900 font-bold text-base sm:text-xl truncate">Arka Cargo Operations</h1>
            <p className="text-neutral-500 text-xs sm:text-sm hidden sm:block">Movement Load Planning System</p>
          </div>
        </div>
        <div className="badge text-xs">
          v1.0
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
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
              Upload your sanitized UTC dataset to generate optimized load plans
            </p>
          </motion.div>

          <motion.div
            className="space-y-3 sm:space-y-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <label className="text-neutral-700 text-sm font-medium">Select Aircraft Type</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <button
                onClick={() => onAircraftSelect('C-17')}
                className={`glass-card p-4 sm:p-6 text-left transition-all duration-200 ${
                  selectedAircraft === 'C-17'
                    ? 'ring-2 ring-primary ring-offset-2 shadow-glass-lg'
                    : 'hover:shadow-glass-lg hover:-translate-y-0.5'
                }`}
              >
                <div className="flex sm:block items-center gap-3 sm:gap-0">
                  <div className="text-2xl sm:text-3xl sm:mb-3">✈️</div>
                  <div>
                    <h3 className="font-bold text-base sm:text-lg text-neutral-900">C-17 Globemaster III</h3>
                    <p className="text-xs sm:text-sm text-neutral-500 mt-0.5 sm:mt-1">18 pallet positions</p>
                    <p className="text-xs sm:text-sm text-neutral-500">170,900 lb payload</p>
                  </div>
                </div>
                {selectedAircraft === 'C-17' && (
                  <div className="mt-2 sm:mt-3">
                    <span className="badge-primary text-xs">Selected</span>
                  </div>
                )}
              </button>
              <button
                onClick={() => onAircraftSelect('C-130')}
                className={`glass-card p-4 sm:p-6 text-left transition-all duration-200 ${
                  selectedAircraft === 'C-130'
                    ? 'ring-2 ring-primary ring-offset-2 shadow-glass-lg'
                    : 'hover:shadow-glass-lg hover:-translate-y-0.5'
                }`}
              >
                <div className="flex sm:block items-center gap-3 sm:gap-0">
                  <div className="text-2xl sm:text-3xl sm:mb-3">🛩️</div>
                  <div>
                    <h3 className="font-bold text-base sm:text-lg text-neutral-900">C-130H/J Hercules</h3>
                    <p className="text-xs sm:text-sm text-neutral-500 mt-0.5 sm:mt-1">6 pallet positions</p>
                    <p className="text-xs sm:text-sm text-neutral-500">42,000 lb payload</p>
                  </div>
                </div>
                {selectedAircraft === 'C-130' && (
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
                  ? 'ring-2 ring-primary ring-offset-2 bg-primary/5'
                  : fileName
                    ? 'ring-2 ring-green-500 ring-offset-2 bg-green-50/50'
                    : 'hover:shadow-glass-lg'
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
                  <p className="text-green-700 font-medium text-base sm:text-lg break-all">{fileName}</p>
                  <p className="text-neutral-500 text-xs sm:text-sm">Click or drop to replace</p>
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

          {(error || xlsxError) && (
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
                  <h4 className="text-red-800 font-medium">Error Processing File</h4>
                  <p className="text-red-600 text-sm mt-1">{error || xlsxError}</p>
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
              <span className="text-neutral-700 font-medium">Processing movement list...</span>
            </motion.div>
          )}

          <div className="text-center space-y-3">
            <p className="text-neutral-400 text-sm">
              Prefer to enter data manually?{' '}
              <button 
                onClick={() => setShowManualEntry(true)}
                className="text-primary hover:text-primary/80 font-medium transition-colors"
              >
                Add cargo items manually
              </button>
            </p>
            <p className="text-neutral-400 text-sm">
              Need sample data?{' '}
              <button className="text-primary hover:text-primary/80 font-medium transition-colors">
                Download template
              </button>
            </p>
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

      <footer className="p-4 border-t border-neutral-200/50 text-center">
        <p className="text-neutral-400 text-sm">
          Arka Cargo Operations • For demonstration purposes only
        </p>
      </footer>
    </div>
  );
}
