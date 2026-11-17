import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS } from '../theme';

export function AddressAutocompleteMobile({
  value,
  onChangeText,
  onSelect,
  placeholder = 'Ubicación / Sector (ej. Talca, Canal Matriz)...',
  editable = true,
}: {
  value: string;
  onChangeText: (text: string) => void;
  onSelect?: (item: { address: string; lat: number; lng: number }) => void;
  placeholder?: string;
  editable?: boolean;
}) {
  const [suggestions, setSuggestions] = useState<{ display_name: string; lat: string; lon: string }[]>([]);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const q = value.trim();
    if (!focused || q.length < 2) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&countrycodes=cl&limit=5&q=${encodeURIComponent(q)}`,
          { headers: { 'User-Agent': 'TerrenoCNR-App/1.0' } },
        );
        const data = (await res.json()) as { display_name: string; lat: string; lon: string }[];
        setSuggestions(Array.isArray(data) ? data : []);
      } catch {
        setSuggestions([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [value, focused]);

  return (
    <View>
      <TextInput
        style={styles.input}
        value={value}
        editable={editable}
        onFocus={() => setFocused(true)}
        onChangeText={(t) => {
          setFocused(true);
          onChangeText(t);
        }}
        placeholder={placeholder}
        placeholderTextColor="#64748b"
      />
      {focused && suggestions.length > 0 && (
        <View style={styles.list}>
          {suggestions.map((s, idx) => (
            <TouchableOpacity
              key={`${s.lat}-${s.lon}-${idx}`}
              onPress={() => {
                const shortAddr = s.display_name.split(',').slice(0, 3).join(',').trim();
                onChangeText(shortAddr);
                setFocused(false);
                setSuggestions([]);
                onSelect?.({ address: shortAddr, lat: Number(s.lat), lng: Number(s.lon) });
              }}
              style={styles.item}
            >
              <Text style={styles.itemTxt} numberOfLines={2}>
                📍 {s.display_name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    backgroundColor: '#fff',
  },
  list: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    backgroundColor: '#fff',
    marginTop: 4,
    overflow: 'hidden',
  },
  item: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  itemTxt: {
    fontSize: 12,
    color: COLORS.text,
  },
});
