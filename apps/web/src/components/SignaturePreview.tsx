'use client';

const SAFE_PATH_RE = /^[MmLlHhVvCcSsQqTtAaZz0-9.,\s-]+$/;

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

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return '0 0 340 220';
  }
  const pad = 14;
  const w = Math.max(80, maxX - minX + pad * 2);
  const h = Math.max(50, maxY - minY + pad * 2);
  return `${minX - pad} ${minY - pad} ${w} ${h}`;
}

export function SignaturePreview({ note }: { note?: string | null }) {
  if (!note) return null;
  let paths: string[] = [];
  try {
    const parsed = JSON.parse(note);
    if (Array.isArray(parsed)) {
      paths = parsed.filter((p): p is string => typeof p === 'string' && SAFE_PATH_RE.test(p));
    }
  } catch {
    return null;
  }

  if (paths.length === 0) return null;
  const viewBox = computeViewBox(paths);

  return (
    <div className="bg-white border border-[#d9e2ec] rounded p-2 inline-block">
      <svg viewBox={viewBox} className="w-64 h-28" role="img" aria-label="Firma digital capturada">
        {paths.map((d, i) => (
          <path key={i} d={d} stroke="#0f172a" strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        ))}
      </svg>
    </div>
  );
}
