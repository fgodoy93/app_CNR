import { isIP } from 'node:net';
import { badRequest } from './errors';

const BLOCKED_HOSTS = new Set(['localhost', 'localhost.localdomain', 'metadata.google.internal']);

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts as [number, number, number, number];
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const norm = ip.toLowerCase();
  if (norm === '::1' || norm === '::') return true;
  if (norm.startsWith('fc') || norm.startsWith('fd')) return true;
  if (norm.startsWith('fe80:')) return true;
  if (norm.startsWith('::ffff:')) return isPrivateIpv4(norm.slice(7));
  return false;
}

/** Validates that an outbound webhook/connector URL is HTTP(S) and does not target loopback/private/metadata IPs. */
export function assertSafeOutboundUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw badRequest('URL inválida');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw badRequest('Solo se permiten URLs http:// o https://');
  }
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || BLOCKED_HOSTS.has(host) || host.endsWith('.local') || host.endsWith('.internal')) {
    throw badRequest('Host de destino no permitido (red interna o local)');
  }
  const ipVer = isIP(host);
  if (ipVer === 4 && isPrivateIpv4(host)) {
    throw badRequest('IP privada o reservada no permitida');
  }
  if (ipVer === 6 && isPrivateIpv6(host)) {
    throw badRequest('IPv6 privada o loopback no permitida');
  }
  return parsed;
}
