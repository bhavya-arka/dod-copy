/**
 * Manual Cargo Entry Form
 * Allows users to add cargo items one by one through a form interface
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Trash2 } from 'lucide-react';

interface CargoItem {
  id: string;
  description: string;
  length: string;
  width: string;
  height: string;
  weight: string;
  leadTcn: string;
  pax: string;
  isPaxOnly: boolean;
}

interface ManualCargoEntryProps {
  onSubmit: (items: CargoItem[]) => void;
  onCancel: () => void;
}

const EMPTY_ITEM: Omit<CargoItem, 'id'> = {
  description: '',
  length: '',
  width: '',
  height: '',
  weight: '',
  leadTcn: '',
  pax: '',
  isPaxOnly: false
};

function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export default function ManualCargoEntry({ onSubmit, onCancel }: ManualCargoEntryProps) {
  const [items, setItems] = useState<CargoItem[]>([
    { ...EMPTY_ITEM, id: crypto.randomUUID() }
  ]);
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  const addItem = () => {
    setItems([...items, { ...EMPTY_ITEM, id: crypto.randomUUID() }]);
  };

  const removeItem = (id: string) => {
    if (items.length > 1) {
      setItems(items.filter(item => item.id !== id));
      const newErrors = { ...errors };
      delete newErrors[id];
      setErrors(newErrors);
    }
  };

  const updateItem = (id: string, field: keyof CargoItem, value: string | boolean) => {
    setItems(items.map(item => {
      if (item.id === id) {
        const updated = { ...item, [field]: value };
        if (field === 'isPaxOnly' && value === true) {
          updated.length = '';
          updated.width = '';
          updated.height = '';
          updated.weight = '';
        }
        return updated;
      }
      return item;
    }));
  };

  const validateItems = (): boolean => {
    const newErrors: Record<string, string[]> = {};
    let isValid = true;

    items.forEach(item => {
      const itemErrors: string[] = [];
      
      if (!item.description.trim()) {
        itemErrors.push('Description required');
      }
      
      if (item.isPaxOnly) {
        const paxNum = parseInt(item.pax);
        if (!item.pax || isNaN(paxNum) || paxNum <= 0) {
          itemErrors.push('PAX count required for PAX-only');
        } else if (paxNum > 500) {
          itemErrors.push('PAX must be <= 500');
        }
      } else {
        const length = parseFloat(item.length);
        const width = parseFloat(item.width);
        const height = parseFloat(item.height);
        const weight = parseFloat(item.weight);
        
        if (!item.length || isNaN(length) || length <= 0) {
          itemErrors.push('Length required');
        }
        if (!item.width || isNaN(width) || width <= 0) {
          itemErrors.push('Width required');
        }
        if (!item.height || isNaN(height) || height <= 0) {
          itemErrors.push('Height required');
        }
        if (!item.weight || isNaN(weight) || weight <= 0) {
          itemErrors.push('Weight required');
        }
      }

      if (itemErrors.length > 0) {
        newErrors[item.id] = itemErrors;
        isValid = false;
      }
    });

    setErrors(newErrors);
    return isValid;
  };

  const handleSubmit = () => {
    if (validateItems()) {
      onSubmit(items);
      setItems([{ ...EMPTY_ITEM, id: crypto.randomUUID() }]);
      setErrors({});
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
      >
        <div className="p-6 border-b border-neutral-200 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-neutral-900">Manual Cargo Entry</h2>
            <p className="text-sm text-neutral-500 mt-1">Add cargo items manually</p>
          </div>
          <button
            onClick={onCancel}
            className="p-2 hover:bg-neutral-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-neutral-500" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[60vh]">
          <div className="space-y-4">
            <AnimatePresence mode="popLayout">
              {items.map((item, index) => (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={`glass-card p-4 ${errors[item.id]?.length ? 'ring-2 ring-red-300' : ''}`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-medium text-neutral-500">Item {index + 1}</span>
                      <label className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={item.isPaxOnly}
                          onChange={(e) => updateItem(item.id, 'isPaxOnly', e.target.checked)}
                          className="rounded border-neutral-300"
                        />
                        <span className="text-neutral-600">PAX Only (personnel)</span>
                      </label>
                    </div>
                    {items.length > 1 && (
                      <button
                        onClick={() => removeItem(item.id)}
                        className="p-1 hover:bg-red-100 rounded text-red-500 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="lg:col-span-2">
                      <label className="block text-xs font-medium text-neutral-600 mb-1">
                        Description *
                      </label>
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                        placeholder="e.g., MHU-226 W/ BINS/EM"
                        className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
                      />
                    </div>

                    {item.isPaxOnly ? (
                      <div className="lg:col-span-2">
                        <label className="block text-xs font-medium text-neutral-600 mb-1">
                          Personnel Count *
                        </label>
                        <input
                          type="number"
                          value={item.pax}
                          onChange={(e) => updateItem(item.id, 'pax', e.target.value)}
                          placeholder="e.g., 25"
                          min="1"
                          max="500"
                          className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
                        />
                      </div>
                    ) : (
                      <>
                        <div>
                          <label className="block text-xs font-medium text-neutral-600 mb-1">
                            Length (in) *
                          </label>
                          <input
                            type="number"
                            value={item.length}
                            onChange={(e) => updateItem(item.id, 'length', e.target.value)}
                            placeholder="108"
                            className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-neutral-600 mb-1">
                            Width (in) *
                          </label>
                          <input
                            type="number"
                            value={item.width}
                            onChange={(e) => updateItem(item.id, 'width', e.target.value)}
                            placeholder="88"
                            className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-neutral-600 mb-1">
                            Height (in) *
                          </label>
                          <input
                            type="number"
                            value={item.height}
                            onChange={(e) => updateItem(item.id, 'height', e.target.value)}
                            placeholder="96"
                            className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-neutral-600 mb-1">
                            Weight (lb) *
                          </label>
                          <input
                            type="number"
                            value={item.weight}
                            onChange={(e) => updateItem(item.id, 'weight', e.target.value)}
                            placeholder="5000"
                            className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-neutral-600 mb-1">
                            Lead TCN
                          </label>
                          <input
                            type="text"
                            value={item.leadTcn}
                            onChange={(e) => updateItem(item.id, 'leadTcn', e.target.value)}
                            placeholder="FYSHP..."
                            className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
                          />
                        </div>
                      </>
                    )}
                  </div>

                  {errors[item.id]?.length > 0 && (
                    <div className="mt-3 text-xs text-red-600">
                      {errors[item.id].join(' | ')}
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          <button
            onClick={addItem}
            className="mt-4 w-full py-3 border-2 border-dashed border-neutral-300 rounded-xl text-neutral-600 hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Another Item
          </button>
        </div>

        <div className="p-6 border-t border-neutral-200 flex justify-between items-center">
          <div className="text-sm text-neutral-500">
            {items.length} item{items.length !== 1 ? 's' : ''} added
          </div>
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="px-6 py-2 text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
            >
              Generate Load Plan
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export { escapeCSV };
export type { CargoItem };
