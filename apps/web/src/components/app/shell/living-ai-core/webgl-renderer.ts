import { BLOB_COUNT, type Blob } from "./blobs";
import type { CoreSample } from "./state-machine";

/**
 * Enhanced tier of the Living AI Core: a compact WebGL2 metaball fragment shader (no scene graph,
 * no dependency). One full-screen triangle, one program, uniforms only — no React state, no
 * allocations per frame. Loaded lazily by the component after idle.
 *
 * Contract: `createWebglRenderer` returns `null` when WebGL2 is unavailable, software-only
 * (`failIfMajorPerformanceCaveat`) or the shaders do not compile; the component then stays on the
 * CSS tier. `webglcontextlost` calls `onLost` and marks the renderer dead. `dispose()` releases
 * program, shaders, VAO and the context. Nothing here reads renderer or GPU identifiers.
 */
export interface WebglRenderer {
  /** CSS size of the core region and the internal scale (≤ 1.5 DPR); the backbuffer is upscaled by the browser. */
  resize(cssWidth: number, cssHeight: number, scale: number): void;
  draw(sample: CoreSample, blobs: readonly Blob[], dark: boolean): void;
  dispose(): void;
  readonly lost: boolean;
}

const CONTEXT_ATTRIBUTES: WebGLContextAttributes = {
  alpha: true,
  premultipliedAlpha: true,
  antialias: false,
  depth: false,
  stencil: false,
  preserveDrawingBuffer: false,
  powerPreference: "low-power",
  failIfMajorPerformanceCaveat: true,
};

const VERTEX = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision mediump float;
out vec4 o;
uniform vec2 u_res;
uniform vec4 u_blob[${BLOB_COUNT}];
uniform vec3 u_col[3];
uniform float u_alpha;
uniform float u_glow;
uniform float u_phase;
uniform float u_halo;
uniform vec3 u_haloCol;
uniform float u_outline;
uniform vec3 u_outlineCol;
uniform float u_edge;
uniform vec3 u_edgeCol;
uniform float u_wave;
uniform vec3 u_waveCol;
uniform vec2 u_centre;
const float TAU = 6.28318530718;
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  uv.y = 1.0 - uv.y;
  float aspect = u_res.x / u_res.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  float field = 0.0;
  vec3 col = vec3(0.0);
  float wsum = 0.0;
  for (int i = 0; i < ${BLOB_COUNT}; i++) {
    vec4 b = u_blob[i];
    vec2 d = p - vec2(b.x * aspect, b.y);
    float f = (b.z * b.z) / (dot(d, d) + 0.002);
    field += f;
    int ci = int(b.w + 0.5);
    vec3 bc = ci == 0 ? u_col[0] : (ci == 1 ? u_col[1] : u_col[2]);
    col += bc * f;
    wsum += f;
  }
  col /= max(wsum, 1e-4);
  float body = smoothstep(0.8, 2.4, field);
  float tail = smoothstep(0.25, 0.9, field) * 0.35;
  float a = body + tail;
  // minimal light flow at the core (streaming / working): a soft band drifting over the shapes
  float band = 0.5 + 0.5 * sin(p.x * 5.0 - p.y * 2.0 - u_phase * TAU);
  a += u_glow * body * 0.3 * band;
  col = mix(col, col + vec3(0.12), u_glow * band * body);
  // cyan halo towards the composer (listening)
  float hd = distance(p, vec2(0.5 * aspect, 1.06));
  float halo = u_halo * smoothstep(0.62, 0.0, hd) * 0.55;
  col = mix(col, u_haloCol, halo / (a + halo + 1e-4));
  a += halo;
  // calm amber outline along the merged contour (approval required)
  float ring = smoothstep(0.35, 0.0, abs(field - 1.2)) * u_outline;
  col = mix(col, u_outlineCol, ring * 0.85);
  a = max(a, ring * 0.7);
  // muted amber/red edge (blocked)
  float ed = min(min(uv.x, 1.0 - uv.x) * aspect, min(uv.y, 1.0 - uv.y));
  float ev = smoothstep(0.14, 0.0, ed) * u_edge * 0.5;
  col = mix(col, u_edgeCol, ev / (a + ev + 1e-4));
  a += ev;
  // one restrained emerald expansion wave (success)
  if (u_wave >= 0.0) {
    float wd = abs(distance(p, vec2(u_centre.x * aspect, u_centre.y)) - u_wave * 1.4);
    float w = smoothstep(0.12, 0.0, wd) * (1.0 - u_wave) * 0.6;
    col = mix(col, u_waveCol, w / (a + w + 1e-4));
    a += w;
  }
  a = clamp(a * u_alpha, 0.0, 1.0);
  o = vec4(col * a, a);
}`;

// design tokens (docs/12 §1): cobalt, violet, cyan; semantic ok / warn / bad — light and dark variants
const LIGHT = {
  cols: [0.122, 0.31, 0.878, 0.427, 0.239, 0.961, 0.039, 0.647, 0.761],
  ok: [0.082, 0.502, 0.239],
  warn: [0.706, 0.325, 0.035],
  bad: [0.725, 0.11, 0.11],
  cyan: [0.039, 0.647, 0.761],
  alpha: 0.2,
};
const DARK = {
  cols: [0.302, 0.51, 1, 0.604, 0.471, 1, 0.22, 0.769, 0.871],
  ok: [0.235, 0.812, 0.431],
  warn: [0.949, 0.647, 0.255],
  bad: [0.949, 0.427, 0.427],
  cyan: [0.22, 0.769, 0.871],
  alpha: 0.28,
};

const UNIFORMS = [
  "u_res",
  "u_blob[0]",
  "u_col[0]",
  "u_alpha",
  "u_glow",
  "u_phase",
  "u_halo",
  "u_haloCol",
  "u_outline",
  "u_outlineCol",
  "u_edge",
  "u_edgeCol",
  "u_wave",
  "u_waveCol",
  "u_centre",
] as const;
type UniformName = (typeof UNIFORMS)[number];

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function createWebglRenderer(canvas: HTMLCanvasElement, onLost: () => void): WebglRenderer | null {
  let ctx: WebGL2RenderingContext | null;
  try {
    ctx = canvas.getContext("webgl2", CONTEXT_ATTRIBUTES) as WebGL2RenderingContext | null;
  } catch {
    return null;
  }
  if (!ctx) return null;

  const vs = compile(ctx, ctx.VERTEX_SHADER, VERTEX);
  const fs = vs ? compile(ctx, ctx.FRAGMENT_SHADER, FRAGMENT) : null;
  const program = vs && fs ? ctx.createProgram() : null;
  if (!vs || !fs || !program) {
    if (vs) ctx.deleteShader(vs);
    if (fs) ctx.deleteShader(fs);
    return null;
  }
  ctx.attachShader(program, vs);
  ctx.attachShader(program, fs);
  ctx.linkProgram(program);
  if (!ctx.getProgramParameter(program, ctx.LINK_STATUS)) {
    ctx.deleteProgram(program);
    ctx.deleteShader(vs);
    ctx.deleteShader(fs);
    return null;
  }
  const vao = ctx.createVertexArray();
  ctx.bindVertexArray(vao);
  ctx.useProgram(program);
  ctx.disable(ctx.DEPTH_TEST);
  ctx.enable(ctx.BLEND);
  ctx.blendFunc(ctx.ONE, ctx.ONE_MINUS_SRC_ALPHA);

  const loc = {} as Record<UniformName, WebGLUniformLocation | null>;
  for (const name of UNIFORMS) loc[name] = ctx.getUniformLocation(program, name);

  const blobData = new Float32Array(BLOB_COUNT * 4);
  const colData = new Float32Array(9);
  let lost = false;
  let width = 0;
  let height = 0;

  const handleLost = () => {
    lost = true;
    onLost();
  };
  canvas.addEventListener("webglcontextlost", handleLost);

  return {
    get lost() {
      return lost;
    },
    resize(cssWidth, cssHeight, scale) {
      if (lost) return;
      width = Math.max(1, Math.round(cssWidth * scale));
      height = Math.max(1, Math.round(cssHeight * scale));
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      ctx.viewport(0, 0, width, height);
    },
    draw(sample, blobs, dark) {
      if (lost || width === 0 || height === 0) return;
      const theme = dark ? DARK : LIGHT;
      const { params } = sample;
      for (let i = 0; i < BLOB_COUNT; i++) {
        const b = blobs[i];
        blobData[i * 4] = b ? b.x : 0.5;
        blobData[i * 4 + 1] = b ? b.y : 0.5;
        blobData[i * 4 + 2] = b ? b.r : 0;
        blobData[i * 4 + 3] = b ? b.c : 0;
      }
      colData.set(theme.cols);
      ctx.uniform2f(loc.u_res, width, height);
      ctx.uniform4fv(loc["u_blob[0]"], blobData);
      ctx.uniform3fv(loc["u_col[0]"], colData);
      ctx.uniform1f(loc.u_alpha, theme.alpha * params.intensity);
      ctx.uniform1f(loc.u_glow, params.glow);
      ctx.uniform1f(loc.u_phase, sample.phase % 1);
      ctx.uniform1f(loc.u_halo, params.halo);
      ctx.uniform3fv(loc.u_haloCol, theme.cyan);
      ctx.uniform1f(loc.u_outline, params.outline);
      ctx.uniform3fv(loc.u_outlineCol, theme.warn);
      ctx.uniform1f(loc.u_edge, params.edge);
      ctx.uniform3fv(loc.u_edgeCol, theme.bad);
      ctx.uniform1f(loc.u_wave, sample.wave);
      ctx.uniform3fv(loc.u_waveCol, theme.ok);
      ctx.uniform2f(loc.u_centre, blobs[0]?.x ?? 0.3, blobs[0]?.y ?? 0.45);
      ctx.clearColor(0, 0, 0, 0);
      ctx.clear(ctx.COLOR_BUFFER_BIT);
      ctx.drawArrays(ctx.TRIANGLES, 0, 3);
    },
    dispose() {
      canvas.removeEventListener("webglcontextlost", handleLost);
      if (lost) return;
      lost = true;
      try {
        ctx.bindVertexArray(null);
        ctx.useProgram(null);
        if (vao) ctx.deleteVertexArray(vao);
        ctx.deleteProgram(program);
        ctx.deleteShader(vs);
        ctx.deleteShader(fs);
        ctx.getExtension("WEBGL_lose_context")?.loseContext();
      } catch {
        /* the context may already be gone; nothing else to release */
      }
    },
  };
}
