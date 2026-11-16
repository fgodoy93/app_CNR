import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { config } from '../config';

const execFileAsync = promisify(execFile);
const SCRIPT_PATH = resolve(process.cwd(), 'scripts/transcribe.py');

/**
 * Transcribes an audio buffer to Spanish text.
 * Uses remote STT_API_URL if configured, otherwise runs local faster-whisper (Python).
 */
export async function transcribeAudioBuffer(buffer: Buffer, fileName = 'audio.m4a', mimeType = 'audio/mp4'): Promise<string> {
  if (!buffer || buffer.length === 0) return '';

  if (config.STT_API_URL) {
    const fd = new FormData();
    fd.append('file', new Blob([new Uint8Array(buffer)], { type: mimeType }), fileName);
    fd.append('model', config.STT_MODEL);
    fd.append('language', 'es');
    const headers: Record<string, string> = {};
    if (config.STT_API_KEY) headers.Authorization = `Bearer ${config.STT_API_KEY}`;

    const res = await fetch(config.STT_API_URL, {
      method: 'POST',
      headers,
      body: fd,
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) {
      throw new Error(`STT remoto HTTP ${res.status}`);
    }
    const data = (await res.json()) as { text?: string };
    return (data?.text || '').trim();
  }

  const dir = await mkdtemp(join(tmpdir(), 'terreno-stt-'));
  const rawExt = extname(fileName);
  const ext = /^\.[a-z0-9]{1,8}$/i.test(rawExt) ? rawExt.toLowerCase() : '.m4a';
  const tmpAudio = join(dir, `audio${ext}`);
  try {
    await writeFile(tmpAudio, buffer);
    const pythonBin = process.env.PYTHON_BIN || 'python';
    const { stdout } = await execFileAsync(pythonBin, [SCRIPT_PATH, tmpAudio, 'small', 'es'], {
      timeout: 90000,
      maxBuffer: 2 * 1024 * 1024,
    });
    const lines = stdout.trim().split(/\r?\n/);
    const lastLine = lines[lines.length - 1] || '{}';
    const parsed = JSON.parse(lastLine) as { text?: string; error?: string };
    if (parsed.error) throw new Error(parsed.error);
    return (parsed.text || '').trim();
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
