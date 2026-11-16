import React from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { COLORS } from '../theme';

function computeViewBox(paths: string[]): string {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const d of paths) {
    const nums = d.match(/-?\d+(?:\.\d+)?/g);
    if (!nums) continue;
    for (let i = 0; i + 1 < nums.length; i += 2) {
      const x = Number(nums[i]);
      const y = Number(nums[i + 1]);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return '0 0 320 220';
  const pad = 12;
  return `${minX - pad} ${minY - pad} ${Math.max(80, maxX - minX + pad * 2)} ${Math.max(50, maxY - minY + pad * 2)}`;
}

export function SignaturePreviewMobile({ note }: { note?: string | null }) {
  if (!note) return null;
  let paths: string[] = [];
  try {
    const parsed = JSON.parse(note);
    if (Array.isArray(parsed)) {
      paths = parsed.filter((p): p is string => typeof p === 'string');
    }
  } catch {
    return null;
  }
  if (paths.length === 0) return null;

  return (
    <View
      style={{
        marginTop: 6,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: COLORS.border,
        borderRadius: 4,
        padding: 4,
        alignSelf: 'flex-start',
      }}
    >
      <Svg width={200} height={82} viewBox={computeViewBox(paths)}>
        {paths.map((d, i) => (
          <Path key={i} d={d} stroke="#0f172a" strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        ))}
      </Svg>
    </View>
  );
}
