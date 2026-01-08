import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { MapPin, Loader2, X, ChevronDown, Building2, Anchor, Plane, Shield, Warehouse } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MilitaryInstallation {
  id: number;
  code: string;
  name: string;
  type: string;
  branch: string;
  city: string;
  state: string | null;
  country: string;
  region: string | null;
  latitude: string;
  longitude: string;
  address: string | null;
  is_active: boolean;
}

export interface MilitaryLocationSelectProps {
  value: MilitaryInstallation | null;
  onChange: (installation: MilitaryInstallation | null) => void;
  placeholder?: string;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  air_base: Plane,
  army_base: Shield,
  navy_base: Anchor,
  marine_base: Shield,
  joint_base: Building2,
  depot: Warehouse,
  warehouse: Warehouse,
  port: Anchor,
  arsenal: Shield,
  station: Building2,
};

const TYPE_COLORS: Record<string, string> = {
  air_base: 'bg-blue-100 text-blue-700',
  army_base: 'bg-green-100 text-green-700',
  navy_base: 'bg-indigo-100 text-indigo-700',
  marine_base: 'bg-red-100 text-red-700',
  joint_base: 'bg-purple-100 text-purple-700',
  depot: 'bg-amber-100 text-amber-700',
  warehouse: 'bg-amber-100 text-amber-700',
  port: 'bg-cyan-100 text-cyan-700',
  arsenal: 'bg-orange-100 text-orange-700',
  station: 'bg-gray-100 text-gray-700',
};

function formatType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function groupByType(installations: MilitaryInstallation[]): Record<string, MilitaryInstallation[]> {
  return installations.reduce((groups, inst) => {
    const key = inst.type;
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(inst);
    return groups;
  }, {} as Record<string, MilitaryInstallation[]>);
}

export function MilitaryLocationSelect({
  value,
  onChange,
  placeholder = "Select military installation...",
  label,
  required = false,
  disabled = false,
  className,
}: MilitaryLocationSelectProps) {
  const [searchValue, setSearchValue] = useState("");
  const [installations, setInstallations] = useState<MilitaryInstallation[]>([]);
  const [filteredInstallations, setFilteredInstallations] = useState<MilitaryInstallation[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchInstallations = async () => {
      setIsLoading(true);
      try {
        const res = await fetch('/api/military-installations', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setInstallations(data);
          setFilteredInstallations(data);
        }
      } catch (error) {
        console.error('Error fetching military installations:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchInstallations();
  }, []);

  useEffect(() => {
    if (!searchValue.trim()) {
      setFilteredInstallations(installations);
      return;
    }
    
    const search = searchValue.toLowerCase().trim();
    const filtered = installations.filter(inst =>
      inst.name.toLowerCase().includes(search) ||
      inst.code.toLowerCase().includes(search) ||
      inst.city.toLowerCase().includes(search) ||
      (inst.state && inst.state.toLowerCase().includes(search))
    );
    setFilteredInstallations(filtered);
    setSelectedIndex(-1);
  }, [searchValue, installations]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSelectedIndex(-1);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const groupedInstallations = useMemo(() => {
    return groupByType(filteredInstallations);
  }, [filteredInstallations]);

  const flatList = useMemo(() => {
    const result: (MilitaryInstallation | { isHeader: true; type: string })[] = [];
    Object.entries(groupedInstallations).sort(([a], [b]) => a.localeCompare(b)).forEach(([type, items]) => {
      result.push({ isHeader: true, type });
      items.forEach(item => result.push(item));
    });
    return result;
  }, [groupedInstallations]);

  const selectableItems = useMemo(() => {
    return flatList.filter((item): item is MilitaryInstallation => !('isHeader' in item));
  }, [flatList]);

  const handleSelect = useCallback((installation: MilitaryInstallation) => {
    onChange(installation);
    setSearchValue("");
    setIsOpen(false);
    setSelectedIndex(-1);
  }, [onChange]);

  const handleClear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
    setSearchValue("");
  }, [onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isOpen && e.key !== 'Escape') {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
        setIsOpen(true);
        return;
      }
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < selectableItems.length - 1 ? prev + 1 : 0
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev > 0 ? prev - 1 : selectableItems.length - 1
        );
        break;
      case "Enter":
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < selectableItems.length) {
          handleSelect(selectableItems[selectedIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        setSelectedIndex(-1);
        break;
    }
  }, [isOpen, selectableItems, selectedIndex, handleSelect]);

  const getLocationString = (inst: MilitaryInstallation) => {
    if (inst.state) {
      return `${inst.city}, ${inst.state}`;
    }
    return `${inst.city}, ${inst.country}`;
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {label && (
        <label className="block text-sm font-medium text-[#111827] mb-1">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}

      <div
        className={cn(
          "relative flex items-center w-full rounded-xl border bg-white transition-all cursor-pointer",
          isOpen ? "border-[#2563EB] ring-2 ring-[#2563EB]/20" : "border-[#E5E7EB] hover:border-[#2563EB]/30",
          disabled && "opacity-50 cursor-not-allowed"
        )}
        onClick={() => !disabled && setIsOpen(true)}
      >
        <div className="absolute left-3 text-amber-500">
          <MapPin className="w-4 h-4" />
        </div>

        {value && !isOpen ? (
          <div className="flex-1 pl-9 pr-16 py-2 flex items-center gap-2 min-w-0">
            <span className={cn("px-1.5 py-0.5 rounded text-xs font-medium shrink-0", TYPE_COLORS[value.type] || 'bg-gray-100 text-gray-700')}>
              {value.code}
            </span>
            <span className="truncate text-[#111827]">{value.name}</span>
          </div>
        ) : (
          <input
            ref={inputRef}
            type="text"
            value={searchValue}
            onChange={(e) => {
              setSearchValue(e.target.value);
              if (!isOpen) setIsOpen(true);
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => !disabled && setIsOpen(true)}
            placeholder={value ? value.name : placeholder}
            disabled={disabled}
            className={cn(
              "flex-1 pl-9 pr-16 py-2 bg-transparent outline-none text-[#111827]",
              "placeholder:text-[#9CA3AF]",
              disabled && "cursor-not-allowed"
            )}
          />
        )}

        <div className="absolute right-3 flex items-center gap-1">
          {isLoading && <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />}
          {value && !isLoading && (
            <button
              type="button"
              onClick={handleClear}
              disabled={disabled}
              className="p-0.5 rounded-full hover:bg-[#F3F4F6] transition-colors"
            >
              <X className="w-3.5 h-3.5 text-[#6B7280]" />
            </button>
          )}
          <ChevronDown className={cn("w-4 h-4 text-[#6B7280] transition-transform", isOpen && "rotate-180")} />
        </div>
      </div>

      {isOpen && !disabled && (
        <div
          ref={listRef}
          className="absolute z-50 mt-1 w-full max-h-80 overflow-auto rounded-xl border border-[#E5E7EB] bg-white shadow-lg"
        >
          {filteredInstallations.length === 0 ? (
            <div className="px-4 py-6 text-center text-[#6B7280]">
              {isLoading ? (
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Loading installations...</span>
                </div>
              ) : (
                <span>No installations found</span>
              )}
            </div>
          ) : (
            Object.entries(groupedInstallations)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([type, items]) => {
                const Icon = TYPE_ICONS[type] || Building2;
                return (
                  <div key={type}>
                    <div className="sticky top-0 bg-[#FAFAFA] border-b border-[#E5E7EB] px-3 py-2 flex items-center gap-2">
                      <Icon className="w-4 h-4 text-[#6B7280]" />
                      <span className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">
                        {formatType(type)}
                      </span>
                      <span className="text-xs text-[#9CA3AF]">({items.length})</span>
                    </div>
                    {items.map((inst) => {
                      const itemIndex = selectableItems.findIndex(i => i.id === inst.id);
                      const isSelected = itemIndex === selectedIndex;
                      const isCurrentValue = value?.id === inst.id;
                      
                      return (
                        <div
                          key={inst.id}
                          onClick={() => handleSelect(inst)}
                          className={cn(
                            "px-3 py-2 cursor-pointer transition-colors border-l-2",
                            isSelected ? "bg-[#EFF6FF] border-l-[#2563EB]" : "border-l-transparent hover:bg-[#F9FAFB]",
                            isCurrentValue && "bg-[#F0FDF4]"
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <span className={cn("px-1.5 py-0.5 rounded text-xs font-medium", TYPE_COLORS[inst.type] || 'bg-gray-100 text-gray-700')}>
                              {inst.code}
                            </span>
                            <span className="font-medium text-[#111827] truncate">{inst.name}</span>
                          </div>
                          <div className="ml-0 mt-1 text-xs text-[#6B7280]">
                            {getLocationString(inst)}
                            {inst.region && <span className="ml-2 text-[#9CA3AF]">• {inst.region}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })
          )}
        </div>
      )}
    </div>
  );
}
