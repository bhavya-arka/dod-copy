import React, { useState, useEffect, useRef, useCallback } from "react";
import { MapPin, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PlaceDetails {
  lat: number;
  lng: number;
  formattedAddress: string;
}

export interface LocationAutocompleteProps {
  value: string;
  onChange: (value: string, placeDetails?: PlaceDetails) => void;
  placeholder?: string;
  label?: string;
  required?: boolean;
  className?: string;
}

interface Suggestion {
  place_id: string;
  description: string;
  structured_formatting?: {
    main_text: string;
    secondary_text: string;
  };
}

function generateSessionToken(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

export function LocationAutocomplete({
  value,
  onChange,
  placeholder = "Enter location...",
  label,
  required = false,
  className,
}: LocationAutocompleteProps) {
  const [inputValue, setInputValue] = useState(value);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [sessionToken] = useState(() => generateSessionToken());
  
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

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

  const fetchSuggestions = useCallback(async (input: string) => {
    if (!input || input.length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/land/places/autocomplete?input=${encodeURIComponent(input)}&sessionToken=${sessionToken}`,
        { credentials: "include" }
      );
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data.predictions || []);
        setIsOpen(true);
        setSelectedIndex(-1);
      }
    } catch (error) {
      console.error("Error fetching place suggestions:", error);
    } finally {
      setIsLoading(false);
    }
  }, [sessionToken]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    onChange(newValue);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      fetchSuggestions(newValue);
    }, 300);
  }, [onChange, fetchSuggestions]);

  const handleSelectSuggestion = useCallback(async (suggestion: Suggestion) => {
    setInputValue(suggestion.description);
    setSuggestions([]);
    setIsOpen(false);
    setSelectedIndex(-1);
    setIsLoading(true);

    try {
      const res = await fetch(
        `/api/land/places/${suggestion.place_id}?sessionToken=${sessionToken}`,
        { credentials: "include" }
      );
      if (res.ok) {
        const data = await res.json();
        const placeDetails: PlaceDetails = {
          lat: data.geometry?.location?.lat || data.lat,
          lng: data.geometry?.location?.lng || data.lng,
          formattedAddress: data.formatted_address || suggestion.description,
        };
        onChange(placeDetails.formattedAddress, placeDetails);
        setInputValue(placeDetails.formattedAddress);
      } else {
        onChange(suggestion.description);
      }
    } catch (error) {
      console.error("Error fetching place details:", error);
      onChange(suggestion.description);
    } finally {
      setIsLoading(false);
    }
  }, [onChange, sessionToken]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || suggestions.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) => 
          prev < suggestions.length - 1 ? prev + 1 : 0
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => 
          prev > 0 ? prev - 1 : suggestions.length - 1
        );
        break;
      case "Enter":
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          handleSelectSuggestion(suggestions[selectedIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        setSelectedIndex(-1);
        break;
    }
  }, [isOpen, suggestions, selectedIndex, handleSelectSuggestion]);

  const handleClear = useCallback(() => {
    setInputValue("");
    onChange("");
    setSuggestions([]);
    setIsOpen(false);
    inputRef.current?.focus();
  }, [onChange]);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {label && (
        <label className="block text-sm font-medium text-amber-700 mb-1">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-500">
          <MapPin className="w-4 h-4" />
        </div>
        
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => inputValue.length >= 2 && suggestions.length > 0 && setIsOpen(true)}
          placeholder={placeholder}
          required={required}
          className={cn(
            "w-full pl-9 pr-9 py-2 rounded-xl border border-amber-200",
            "focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20",
            "outline-none transition-all bg-white text-amber-900",
            "placeholder:text-amber-400"
          )}
          autoComplete="off"
        />
        
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {isLoading && <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />}
          {inputValue && !isLoading && (
            <button
              type="button"
              onClick={handleClear}
              className="p-0.5 rounded-full hover:bg-amber-100 transition-colors"
            >
              <X className="w-3.5 h-3.5 text-amber-500" />
            </button>
          )}
        </div>
      </div>

      {isOpen && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 py-1 bg-white border border-amber-200 rounded-xl shadow-lg max-h-60 overflow-auto">
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion.place_id}
              type="button"
              onClick={() => handleSelectSuggestion(suggestion)}
              className={cn(
                "w-full px-3 py-2 text-left text-sm transition-colors flex items-start gap-2",
                index === selectedIndex
                  ? "bg-amber-100 text-amber-900"
                  : "text-amber-800 hover:bg-amber-50"
              )}
            >
              <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-500" />
              <div className="flex-1 min-w-0">
                {suggestion.structured_formatting ? (
                  <>
                    <div className="font-medium truncate">
                      {suggestion.structured_formatting.main_text}
                    </div>
                    <div className="text-xs text-amber-600 truncate">
                      {suggestion.structured_formatting.secondary_text}
                    </div>
                  </>
                ) : (
                  <div className="truncate">{suggestion.description}</div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
