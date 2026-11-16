'use client';

import { useEffect, useState } from 'react';
import { MapPin, Search } from 'lucide-react';

export interface AddressSuggestion {
  display_name: string;
  lat: string;
  lon: string;
}

export function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = 'Buscar dirección, comuna o zona (ej. Talca, Canal Matriz)...',
  className = '',
}: {
  value: string;
  onChange: (val: string) => void;
  onSelect?: (item: { address: string; lat: number; lng: number }) => void;
  placeholder?: string;
  className?: string;
}) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = value.trim();
    if (!open || q.length < 2) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&countrycodes=cl&addressdetails=1&limit=6&q=${encodeURIComponent(q)}`,
        );
        const data = (await res.json()) as AddressSuggestion[];
        setSuggestions(Array.isArray(data) ? data : []);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 280);
    return () => clearTimeout(timer);
  }, [value, open]);

  return (
    <div className={`relative ${className}`}>
      <div className="relative flex items-center">
        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none" />
        <input
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="w-full pl-8 pr-3 py-2 border border-[#d8e3df] rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0b3b60]/20"
        />
        {loading && <span className="absolute right-3 text-[11px] text-slate-400">Buscando...</span>}
      </div>

      {open && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 mt-1 bg-white border border-[#d8e3df] rounded-lg shadow-lg z-40 max-h-52 overflow-y-auto">
          {suggestions.map((s, idx) => (
            <button
              key={`${s.lat}-${s.lon}-${idx}`}
              type="button"
              onClick={() => {
                const shortAddr = s.display_name.split(',').slice(0, 3).join(',').trim();
                onChange(shortAddr);
                setOpen(false);
                setSuggestions([]);
                onSelect?.({ address: shortAddr, lat: Number(s.lat), lng: Number(s.lon) });
              }}
              className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-emerald-50 border-b last:border-b-0 border-slate-100 flex items-start gap-2"
            >
              <MapPin className="w-3.5 h-3.5 text-[#146c43] shrink-0 mt-0.5" />
              <span className="line-clamp-2">{s.display_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
