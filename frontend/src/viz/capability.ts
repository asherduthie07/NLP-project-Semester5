/** WebGLCapabilityDetector. Probes once with a throwaway context so it never consumes a context slot. */
export type GpuTier = 'none' | 'software' | 'low' | 'high';
export interface WebGLCapability { tier: GpuTier; renderer: string | null; reason: string }

let cached: WebGLCapability | null = null;

export function classifyRenderer(renderer: string | null, cores: number, memory: number | undefined): GpuTier {
  const name = (renderer ?? '').toLowerCase();
  if (/swiftshader|llvmpipe|softpipe|basic render|software/.test(name)) return 'software';
  if (/intel.*(hd graphics|uhd graphics [0-9]{3}\b)|mali-[gt][0-9]{1,2}\b|adreno.*[1-5][0-9]{2}\b/.test(name)) return 'low';
  if (cores <= 4 || (memory !== undefined && memory <= 4)) return 'low';
  return 'high';
}

export function detectWebGL(): WebGLCapability {
  if (cached) return cached;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return (cached = { tier: 'none', renderer: null, reason: 'WebGL 2 is not available in this browser.' });
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : null;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    const tier = classifyRenderer(renderer, navigator.hardwareConcurrency ?? 4, memory);
    return (cached = { tier, renderer, reason: tier === 'software' ? 'Only a software renderer is available.' : 'Hardware WebGL 2 is available.' });
  } catch {
    return (cached = { tier: 'none', renderer: null, reason: 'WebGL 2 could not be initialized.' });
  }
}

export function resetCapabilityForTests() { cached = null; }
