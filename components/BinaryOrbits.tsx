/* eslint-disable react-hooks/exhaustive-deps */
'use client';

import React, {
  forwardRef,
  useEffect,
  useRef,
  useImperativeHandle,
  useSyncExternalStore
} from 'react';
import * as THREE from 'three';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const TWO_PI = 2 * Math.PI;

const subscribeReducedMotion = (cb: () => void) => {
  if (typeof window === 'undefined') return () => {};
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};

const getReducedMotionSnapshot = () => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

const clamp = (val: number, min: number, max: number) => Math.min(max, Math.max(min, val));

let cachedCtx: CanvasRenderingContext2D | null = null;
const parseColor = (colorStr: string, defaultColor: [number, number, number]): [number, number, number] => {
  if (typeof document === 'undefined') return defaultColor;
  if (!cachedCtx) {
    cachedCtx = document.createElement('canvas').getContext('2d');
  }
  if (!cachedCtx) return defaultColor;
  cachedCtx.fillStyle = '#010203';
  cachedCtx.fillStyle = colorStr;
  const val = String(cachedCtx.fillStyle);
  if (val === '#010203' && colorStr.trim().toLowerCase() !== '#010203') return defaultColor;
  if (val.startsWith('#')) {
    const hex = val.slice(1);
    return [
      parseInt(hex.slice(0, 2), 16) / 255,
      parseInt(hex.slice(2, 4), 16) / 255,
      parseInt(hex.slice(4, 6), 16) / 255
    ];
  }
  const match = val.match(/[\d.]+/g);
  return !match || match.length < 3 ? defaultColor : [Number(match[0]) / 255, Number(match[1]) / 255, Number(match[2]) / 255];
};

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

const srgbToOklab = ([r, g, b]: [number, number, number]): [number, number, number] => {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
  ];
};

const ORBIT_GLSL = `uniform float uTime;
uniform float uSpin;
uniform float uCoreRadius;
uniform float uArms;
uniform float uTwist;
uniform float uEps;
uniform float uPattern;

float omega(float a) {
  return uSpin / sqrt(a * a + uCoreRadius * uCoreRadius);
}

vec3 orbit(float a, float psi, float bulge, out float phase) {
  float th = psi + omega(a) * uTime;
  phase = uArms * (th + uTwist * log(max(a, 1e-3)) - uPattern * uTime);
  float r = a * (1.0 - uEps * cos(phase) * (1.0 - bulge));
  return vec3(r * cos(th), r * sin(th), th);
}`;

const WAKE_FRAG = `precision highp float;
uniform sampler2D uStatic;
uniform sampler2D uState;
uniform vec4 uSegment;
uniform float uGather;
uniform float uDrag;
uniform float uWidth;
uniform float uDecay;
uniform float uTime;
uniform float uSpin;
uniform float uCoreRadius;
uniform float uArms;
uniform float uTwist;
uniform float uEps;
uniform float uPattern;

float omega(float a) {
  return uSpin / sqrt(a * a + uCoreRadius * uCoreRadius);
}

vec3 orbit(float a, float psi, float bulge, out float phase) {
  float th = psi + omega(a) * uTime;
  phase = uArms * (th + uTwist * log(max(a, 1e-3)) - uPattern * uTime);
  float r = a * (1.0 - uEps * cos(phase) * (1.0 - bulge));
  return vec3(r * cos(th), r * sin(th), th);
}
out vec4 fragColor;

void main() {
  ivec2 cell = ivec2(gl_FragCoord.xy);
  vec2 offset = texelFetch(uState, cell, 0).xy;
  if (uGather > 0.0) {
    vec4 star = texelFetch(uStatic, cell, 0);
    float phase;
    vec3 at = orbit(star.x, star.y, star.z, phase);
    vec2 radial = vec2(cos(at.z), sin(at.z));
    vec2 tangent = vec2(-radial.y, radial.x);
    vec2 p = at.xy + radial * offset.x + tangent * offset.y;
    vec2 d = uSegment.zw - uSegment.xy;
    float len = length(d);
    vec2 dir = len > 1e-6 ? d / len : vec2(1.0, 0.0);
    float along = clamp(dot(p - uSegment.xy, dir), 0.0, len);
    vec2 n = p - uSegment.xy - dir * along;
    float w = exp(-dot(n, n) / (uWidth * uWidth)) * (1.0 - 0.7 * star.z) * smoothstep(0.05, 0.3, star.x);
    vec2 delta = (dir * uDrag * uWidth - n * uGather) * w;
    offset += vec2(dot(delta, radial), dot(delta, tangent));
  }
  fragColor = vec4(offset * uDecay, 0.0, 1.0);
}`;

const STARS_VERT = `in vec4 aOrbit;
in vec4 aTraits;
uniform sampler2D uState;
uniform int uStride;
uniform vec2 uResolution;
uniform vec2 uCenter;
uniform float uFocal;
uniform float uDistance;
uniform float uIncline;
uniform float uRoll;
uniform float uPixelRatio;
uniform float uRealTime;
uniform float uDust;
uniform float uCore;
uniform float uVoid;
uniform float uSize;
uniform float uSizeScale;
uniform float uSparkle;
uniform float uTwinkle;
uniform float uBack;
uniform float uEnergy;
uniform float uInk;
uniform vec3 uLabA;
uniform vec3 uLabB;
uniform vec4 uRipples[6];
uniform float uActive;
uniform float uTime;
uniform float uSpin;
uniform float uCoreRadius;
uniform float uArms;
uniform float uTwist;
uniform float uEps;
uniform float uPattern;

float omega(float a) {
  return uSpin / sqrt(a * a + uCoreRadius * uCoreRadius);
}

vec3 orbit(float a, float psi, float bulge, out float phase) {
  float th = psi + omega(a) * uTime;
  phase = uArms * (th + uTwist * log(max(a, 1e-3)) - uPattern * uTime);
  float r = a * (1.0 - uEps * cos(phase) * (1.0 - bulge));
  return vec3(r * cos(th), r * sin(th), th);
}
out vec3 vColor;
out float vGain;

vec3 labToLinear(vec3 lab) {
  float l = lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z;
  float m = lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z;
  float s = lab.x - 0.0894841775 * lab.y - 1.2914855480 * lab.z;
  l = l * l * l;
  m = m * m * m;
  s = s * s * s;
  return max(vec3(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  ), 0.0);
}

void main() {
  float a = aOrbit.x;
  float bulge = aTraits.x;
  float phase;
  vec3 at = orbit(a, aOrbit.y, bulge, phase);
  vec2 radial = vec2(cos(at.z), sin(at.z));
  vec2 tangent = vec2(-radial.y, radial.x);
  vec2 offset = texelFetch(uState, ivec2(gl_VertexID % uStride, gl_VertexID / uStride), 0).xy;
  vec3 p = vec3(at.xy + radial * offset.x + tangent * offset.y, aOrbit.z);
  float tidal = smoothstep(0.004, 0.03, length(offset));
  float ring = 0.0;
  if (uActive > 0.5) {
    for (int k = 0; k < 6; k++) {
      vec4 wave = uRipples[k];
      if (wave.w <= 0.0) continue;
      float age = uRealTime - wave.z;
      if (age < 0.0 || age > 7.0) continue;
      vec2 rel = p.xy - wave.xy;
      float rr = length(rel);
      float front = 0.05 + 0.32 * age;
      float width = 0.07 + 0.03 * age;
      float g = (rr - front) / width;
      float band = exp(-g * g);
      float envelope = wave.w * smoothstep(0.0, 0.7, age) * exp(-age / 2.2) * smoothstep(0.03, 0.2, front + length(wave.xy));
      p.xy -= rel / max(rr, 1e-4) * (rr - front) * 0.55 * envelope * band;
      p.z += 0.03 * envelope * band;
      ring += envelope * band;
    }
  }

  float ci = cos(uIncline);
  float si = sin(uIncline);
  vec3 q = vec3(p.x, p.y * ci + p.z * si, -p.y * si + p.z * ci);
  float cr = cos(uRoll);
  float sr = sin(uRoll);
  q.xy = vec2(cr * q.x - sr * q.y, sr * q.x + cr * q.y);
  float depth = uDistance - q.z;
  vec2 screen = uCenter + uFocal * q.xy / depth;

  float mk = uArms * uTwist;
  float crest = (cos(phase) - mk * sin(phase)) / sqrt(1.0 + mk * mk);
  float arm = pow(max(crest, 0.0), 2.0) * (1.0 - bulge);
  float laneCrest = (cos(phase - 0.55) - mk * sin(phase - 0.55)) / sqrt(1.0 + mk * mk);
  float lane = pow(max(laneCrest, 0.0), 8.0) * (1.0 - arm) * (1.0 - bulge) * smoothstep(0.1, 0.3, a);

  float reach = smoothstep(0.02, 0.55, a);
  vec3 tone = labToLinear(mix(uLabB, uLabA, reach));
  vec3 core = labToLinear(vec3(min(uLabB.x * 1.08 + 0.06, 0.98), uLabB.yz * 0.45));
  vec3 color = mix(tone, core, bulge * 0.75);
  vec3 youngColor = labToLinear(vec3(min(uLabB.x * 0.92, 0.9), uLabB.yz * 1.25));
  float young = smoothstep(0.84, 0.97, aTraits.z) * arm;
  float kindled = clamp(tidal * 0.7 + ring * 1.5, 0.0, 0.75) * (1.0 - bulge * 0.7);
  color = mix(color, youngColor, max(young * 0.75, kindled));
  float bright = step(1.0 - uSparkle, aTraits.y) * (1.0 - bulge * 0.6);
  color = mix(color, vec3(1.0, 0.97, 1.0), bright * 0.35);

  float twinkle = 1.0 - uTwinkle * 0.55 * (0.5 + 0.5 * sin(uRealTime * (0.6 + 1.6 * aTraits.w) + aTraits.w * 61.0));
  float body = mix(0.5 + 1.2 * arm + young * 1.4, uCore * 1.1, bulge) * (1.0 + bright * 2.2);
  body *= 1.0 - uDust * 0.8 * lane;
  float edge = 1.0 - smoothstep(0.82, 1.08, a);
  float hollow = smoothstep(uVoid * 0.85, uVoid * 1.15 + 0.01, a);
  float near = clamp(0.5 + 0.5 * q.z / 0.9, 0.0, 1.0);
  float gain = body * edge * hollow * twinkle * mix(uBack, 1.0, near) * (1.0 + uEnergy * 0.15);
  gain *= 1.0 + 0.9 * tidal * (1.0 - bulge * 0.7) + 0.5 * min(ring, 1.0);

  vColor = mix(color, labToLinear(vec3(uLabA.x * 0.62, uLabA.yz * 1.15)), uInk * 0.35);
  vGain = gain;
  float size = uSize * uSizeScale * uPixelRatio * mix(0.6, 1.1, fract(aTraits.y * 7.31)) * (1.0 + bright * 0.7 + young * 0.4);
  gl_PointSize = max(size * uDistance / depth, 1.0);
  gl_Position = vec4(screen / uResolution * 2.0 - 1.0, 0.0, 1.0);
}`;

const STARS_FRAG = `precision highp float;
uniform float uStarGain;
in vec3 vColor;
in float vGain;
out vec4 fragColor;

void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(q, q);
  float e = (exp(-r2 * 6.0) + 0.25 * exp(-r2 * 2.0)) * vGain * uStarGain;
  fragColor = vec4(vColor * e, e);
}`;

const QUAD_VERT = `out vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const DOWNSAMPLE_FRAG = `precision highp float;
uniform sampler2D uSource;
uniform vec2 uTexel;
in vec2 vUv;
out vec4 fragColor;

void main() {
  vec4 a = texture(uSource, vUv + uTexel * vec2(-1.0, -1.0));
  vec4 b = texture(uSource, vUv + uTexel * vec2(1.0, -1.0));
  vec4 c = texture(uSource, vUv + uTexel * vec2(-1.0, 1.0));
  vec4 d = texture(uSource, vUv + uTexel * vec2(1.0, 1.0));
  fragColor = (a + b + c + d) * 0.125 + texture(uSource, vUv) * 0.5;
}`;

const UPSAMPLE_FRAG = `precision highp float;
uniform sampler2D uSource;
uniform sampler2D uBase;
uniform vec2 uTexel;
in vec2 vUv;
out vec4 fragColor;

void main() {
  vec4 sum = texture(uSource, vUv) * 4.0;
  sum += texture(uSource, vUv + uTexel * vec2(-1.0, 0.0)) * 2.0;
  sum += texture(uSource, vUv + uTexel * vec2(1.0, 0.0)) * 2.0;
  sum += texture(uSource, vUv + uTexel * vec2(0.0, -1.0)) * 2.0;
  sum += texture(uSource, vUv + uTexel * vec2(0.0, 1.0)) * 2.0;
  sum += texture(uSource, vUv + uTexel * vec2(-1.0, -1.0));
  sum += texture(uSource, vUv + uTexel * vec2(1.0, -1.0));
  sum += texture(uSource, vUv + uTexel * vec2(-1.0, 1.0));
  sum += texture(uSource, vUv + uTexel * vec2(1.0, 1.0));
  fragColor = texture(uBase, vUv) + sum / 16.0;
}`;

const COMPOSITE_FRAG = `precision highp float;
uniform sampler2D uLines;
uniform sampler2D uBloom;
uniform vec3 uBackground;
uniform float uGlow;
uniform float uExposure;
uniform float uMode;
uniform float uGrain;
in vec2 vUv;
out vec4 fragColor;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 encode(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}

void main() {
  vec4 lines = texture(uLines, vUv);
  vec4 bloom = texture(uBloom, vUv);
  vec3 color;
  if (uMode < 0.5) {
    vec3 light = (lines.rgb + bloom.rgb * uGlow) * uExposure;
    vec3 exposed = 1.0 - exp(-light);
    float peak = max(exposed.r, max(exposed.g, exposed.b));
    exposed = mix(exposed, vec3(peak), smoothstep(0.75, 1.0, peak) * 0.35);
    color = uBackground + (1.0 - uBackground) * exposed;
  } else {
    float energy = lines.a + bloom.a * uGlow * 0.2;
    vec3 hue = (lines.rgb + bloom.rgb * uGlow * 0.2) / max(energy, 1e-4);
    float cover = clamp(1.0 - exp(-energy * uExposure * 1.4), 0.0, 0.94);
    color = mix(uBackground, clamp(hue * 0.8, 0.0, 1.0), cover);
  }
  float grain = hash(gl_FragCoord.xy + uGrain * 311.0) - 0.5;
  fragColor = vec4(encode(color) + grain * (1.2 / 255.0), 1.0);
}`;

export interface BinaryOrbitsProps {
  colors?: [string, string];
  backgroundColor?: string;
  mode?: 'auto' | 'glow' | 'ink';
  stars?: number;
  starSize?: number;
  sparkle?: number;
  arms?: number;
  twist?: number;
  armStrength?: number;
  dust?: number;
  core?: number;
  coreSize?: number;
  innerVoid?: number;
  thickness?: number;
  tilt?: number;
  roll?: number;
  scale?: number;
  centerX?: number;
  centerY?: number;
  speed?: number;
  twinkle?: number;
  depth?: number;
  glow?: number;
  intensity?: number;
  interactive?: boolean;
  hoverWake?: boolean;
  clickRipple?: boolean;
  wakeStrength?: number;
  rippleStrength?: number;
  hoverBoost?: number;
  paused?: boolean;
  quality?: number;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

export interface BinaryOrbitsRef {
  ripple: () => void;
}

export const BinaryOrbits = forwardRef<BinaryOrbitsRef, BinaryOrbitsProps>(function BinaryOrbits(
  {
    colors = ['#7B4DFF', '#FFC2EE'],
    backgroundColor = '#0A0A0A',
    mode = 'auto',
    stars = 24000,
    starSize = 1.7,
    sparkle = 0.5,
    arms = 3,
    twist = 3.5,
    armStrength = 0.5,
    dust = 0.5,
    core = 1,
    coreSize = 0.07,
    innerVoid = 0,
    thickness = 0.02,
    tilt = 62,
    roll = -8,
    scale = 1,
    centerX = 0.5,
    centerY = 0.52,
    speed = 1,
    twinkle = 0.35,
    depth = 0.4,
    glow = 0.45,
    intensity = 1,
    interactive = true,
    hoverWake = true,
    clickRipple = true,
    wakeStrength = 1,
    rippleStrength = 1,
    hoverBoost = 0.5,
    paused = false,
    quality = 1,
    className,
    style,
    children
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<{ sync: () => void; destroy: () => void; ripple: () => void } | null>(null);
  const isReduced = useSyncExternalStore(subscribeReducedMotion, getReducedMotionSnapshot, () => false);

  const stateRef = useRef({
    colors,
    backgroundColor,
    mode,
    stars,
    starSize,
    sparkle,
    arms,
    twist,
    armStrength,
    dust,
    core,
    coreSize,
    innerVoid,
    thickness,
    tilt,
    roll,
    scale,
    centerX,
    centerY,
    speed,
    twinkle,
    depth,
    glow,
    intensity,
    interactive,
    hoverWake,
    clickRipple,
    wakeStrength,
    rippleStrength,
    hoverBoost,
    paused,
    quality,
    reduced: isReduced
  });

  stateRef.current = {
    colors,
    backgroundColor,
    mode,
    stars,
    starSize,
    sparkle,
    arms,
    twist,
    armStrength,
    dust,
    core,
    coreSize,
    innerVoid,
    thickness,
    tilt,
    roll,
    scale,
    centerX,
    centerY,
    speed,
    twinkle,
    depth,
    glow,
    intensity,
    interactive,
    hoverWake,
    clickRipple,
    wakeStrength,
    rippleStrength,
    hoverBoost,
    paused,
    quality,
    reduced: isReduced
  };

  useEffect(() => {
    engineRef.current?.sync();
  }, [
    colors,
    backgroundColor,
    mode,
    stars,
    starSize,
    sparkle,
    arms,
    twist,
    armStrength,
    dust,
    core,
    coreSize,
    innerVoid,
    thickness,
    tilt,
    roll,
    scale,
    centerX,
    centerY,
    speed,
    twinkle,
    depth,
    glow,
    intensity,
    interactive,
    hoverWake,
    clickRipple,
    wakeStrength,
    rippleStrength,
    hoverBoost,
    paused,
    quality,
    isReduced
  ]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const engine = ((elem: HTMLDivElement, state: typeof stateRef) => {
      const canvas = document.createElement('canvas');
      canvas.setAttribute('aria-hidden', 'true');
      canvas.style.position = 'absolute';
      canvas.style.inset = '0';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      canvas.style.pointerEvents = 'none';
      elem.prepend(canvas);

      let renderer: THREE.WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({
          canvas,
          alpha: false,
          antialias: false,
          powerPreference: 'high-performance'
        });
      } catch {
        canvas.remove();
        return null;
      }

      if (!renderer.capabilities.isWebGL2) {
        renderer.dispose();
        canvas.remove();
        return null;
      }

      renderer.autoClear = false;

      const halfFloatSupported =
        renderer.extensions.has('EXT_color_buffer_float') ||
        renderer.extensions.has('EXT_color_buffer_half_float');
      const rtType = halfFloatSupported ? THREE.HalfFloatType : THREE.UnsignedByteType;

      const orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const quadGeom = new THREE.PlaneGeometry(2, 2);

      const ripples = Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, -100, 0));
      const simType = renderer.extensions.has('EXT_color_buffer_float') ? THREE.FloatType : THREE.HalfFloatType;

      const orbitUniforms = {
        uTime: { value: 0 },
        uSpin: { value: 0.11 },
        uCoreRadius: { value: 0.08 },
        uArms: { value: 3 },
        uTwist: { value: 3.5 },
        uEps: { value: 0.04 },
        uPattern: { value: 0.007 }
      };

      const starsMaterial = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        uniforms: {
          ...orbitUniforms,
          uState: { value: null },
          uStride: { value: 512 },
          uResolution: { value: new THREE.Vector2() },
          uCenter: { value: new THREE.Vector2() },
          uFocal: { value: 1 },
          uDistance: { value: 3.6 },
          uIncline: { value: 1 },
          uRoll: { value: 0 },
          uPixelRatio: { value: 1 },
          uRealTime: { value: 0 },
          uDust: { value: 0.5 },
          uCore: { value: 1 },
          uVoid: { value: 0 },
          uSize: { value: 1.4 },
          uSizeScale: { value: 1 },
          uSparkle: { value: 0.08 },
          uTwinkle: { value: 0.4 },
          uBack: { value: 0.5 },
          uEnergy: { value: 0 },
          uInk: { value: 0 },
          uLabA: { value: new THREE.Vector3() },
          uLabB: { value: new THREE.Vector3() },
          uRipples: { value: ripples },
          uActive: { value: 0 },
          uStarGain: { value: 0.3 }
        },
        vertexShader: STARS_VERT,
        fragmentShader: STARS_FRAG,
        depthTest: false,
        depthWrite: false,
        transparent: true,
        blending: THREE.CustomBlending,
        blendEquation: THREE.AddEquation,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneFactor,
        blendSrcAlpha: THREE.OneFactor,
        blendDstAlpha: THREE.OneFactor
      });

      const makeQuadMat = (frag: string, unifs: Record<string, any>) =>
        new THREE.ShaderMaterial({
          glslVersion: THREE.GLSL3,
          uniforms: unifs,
          vertexShader: QUAD_VERT,
          fragmentShader: frag,
          depthTest: false,
          depthWrite: false,
          blending: THREE.NoBlending
        });

      const wakeMaterial = makeQuadMat(WAKE_FRAG, {
        ...orbitUniforms,
        uStatic: { value: null },
        uState: { value: null },
        uSegment: { value: new THREE.Vector4() },
        uGather: { value: 0 },
        uDrag: { value: 0 },
        uWidth: { value: 0.09 },
        uDecay: { value: 1 }
      });

      const downsampleMaterial = makeQuadMat(DOWNSAMPLE_FRAG, {
        uSource: { value: null },
        uTexel: { value: new THREE.Vector2() }
      });

      const upsampleMaterial = makeQuadMat(UPSAMPLE_FRAG, {
        uSource: { value: null },
        uBase: { value: null },
        uTexel: { value: new THREE.Vector2() }
      });

      const compositeMaterial = makeQuadMat(COMPOSITE_FRAG, {
        uLines: { value: null },
        uBloom: { value: null },
        uBackground: { value: new THREE.Vector3() },
        uGlow: { value: 0.5 },
        uExposure: { value: 1 },
        uMode: { value: 0 },
        uGrain: { value: 0 }
      });

      const points = new THREE.Points(new THREE.BufferGeometry(), starsMaterial);
      points.frustumCulled = false;
      const starsScene = new THREE.Scene();
      starsScene.add(points);

      const quadMesh = new THREE.Mesh(quadGeom, compositeMaterial);
      quadMesh.frustumCulled = false;
      const quadScene = new THREE.Scene();
      quadScene.add(quadMesh);

      let lastGeomKey = '';
      let staticTexture: THREE.DataTexture | null = null;
      let stateTargets: THREE.WebGLRenderTarget[] = [];
      let activeStateIndex = 0;

      const createRT = (w: number, h: number) =>
        new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
          type: rtType,
          format: THREE.RGBAFormat,
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          depthBuffer: false,
          stencilBuffer: false,
          generateMipmaps: false
        });

      let mainRT: THREE.WebGLRenderTarget | null = null;
      let downsampleRTs: THREE.WebGLRenderTarget[] = [];
      let upsampleRTs: THREE.WebGLRenderTarget[] = [];

      let destroyed = false;
      let animFrameId = 0;
      let lastTime = 0;
      let isVisible = true;
      let simTime = 40;
      let realTime = 0;
      let energy = 0;
      let viewWidth = 1;
      let viewHeight = 1;
      let currentDpr = 1;
      let grainOffset = 0;
      let lastWakeTime = -100;

      const pointerState = {
        inside: false,
        disc: null as { x: number; y: number } | null,
        trail: null as { x: number; y: number } | null
      };

      const clearBloomRTs = () => {
        mainRT?.dispose();
        downsampleRTs.forEach(rt => rt.dispose());
        upsampleRTs.forEach(rt => rt.dispose());
        mainRT = null;
        downsampleRTs = [];
        upsampleRTs = [];
      };

      const renderQuad = (mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null) => {
        quadMesh.material = mat;
        renderer.setRenderTarget(target);
        renderer.render(quadScene, orthoCamera);
      };

      const rebuildGeometry = () => {
        const s = state.current;
        const starCount = Math.round(clamp(s.stars ?? 70000, 2000, 250000));
        const cSize = clamp(s.coreSize ?? 0.07, 0.02, 0.3);
        const thk = clamp(s.thickness ?? 0.02, 0, 0.2);
        const key = [starCount, cSize, thk].join('|');
        if (key === lastGeomKey) return;
        lastGeomKey = key;

        points.geometry.dispose();
        staticTexture?.dispose();
        stateTargets.forEach(rt => rt.dispose());

        const buildData = ((count: number, coreRadius: number, thicknessVal: number) => {
          let seed = 23;
          const rng = () => ((seed = (16807 * seed) % 0x7fffffff) / 0x7fffffff);
          const gaussian = () => Math.sqrt(-2 * Math.log(Math.max(rng(), 1e-9))) * Math.cos(TWO_PI * rng());
          const rows = Math.ceil(count / 512);
          const interleavedData = new Float32Array(8 * count);
          const staticData = new Float32Array(512 * rows * 4);

          for (let i = 0; i < count; i++) {
            let radius: number;
            let zVal: number;
            const isBulge = rng() < 0.16;

            if (isBulge) {
              radius = Math.min(
                coreRadius / Math.sqrt(Math.pow(Math.min(Math.max(rng(), 1e-4), 0.995), -2 / 3) - 1),
                4 * coreRadius
              );
              zVal = gaussian() * radius * 0.5;
            } else {
              do {
                radius = -0.32 * Math.log(Math.max(rng() * rng(), 1e-9));
              } while (radius > 1.08);
              radius = Math.max(radius, 0.012);
              zVal = gaussian() * thicknessVal * (0.5 + 0.5 * Math.exp(-radius / 0.25));
            }

            const angle = rng() * TWO_PI;
            interleavedData.set([radius, angle, zVal, rng(), isBulge ? 1 : 0, rng(), rng(), rng()], 8 * i);
            staticData.set([radius, angle, isBulge ? 1 : 0, 0], 4 * i);
          }

          const geom = new THREE.BufferGeometry();
          const buffer = new THREE.InterleavedBuffer(interleavedData, 8);
          geom.setAttribute('aOrbit', new THREE.InterleavedBufferAttribute(buffer, 4, 0));
          geom.setAttribute('aTraits', new THREE.InterleavedBufferAttribute(buffer, 4, 4));
          geom.setAttribute('position', new THREE.InterleavedBufferAttribute(buffer, 3, 0));

          const tex = new THREE.DataTexture(staticData, 512, rows, THREE.RGBAFormat, THREE.FloatType);
          tex.minFilter = THREE.NearestFilter;
          tex.magFilter = THREE.NearestFilter;
          tex.generateMipmaps = false;
          tex.needsUpdate = true;

          return { geometry: geom, texture: tex, rows };
        })(starCount, cSize, thk);

        points.geometry = buildData.geometry;
        staticTexture = buildData.texture;

        stateTargets = [0, 1].map(
          () =>
            new THREE.WebGLRenderTarget(512, buildData.rows, {
              type: simType,
              format: THREE.RGBAFormat,
              minFilter: THREE.NearestFilter,
              magFilter: THREE.NearestFilter,
              depthBuffer: false,
              stencilBuffer: false,
              generateMipmaps: false
            })
        );
        activeStateIndex = 0;

        for (const rt of stateTargets) {
          renderer.setRenderTarget(rt);
          renderer.setClearColor(0, 0);
          renderer.clear();
        }

        wakeMaterial.uniforms.uStatic.value = staticTexture;
        starsMaterial.uniforms.uState.value = stateTargets[0].texture;
      };

      const getProjection = () => {
        const s = state.current;
        const w = viewWidth * currentDpr;
        const h = viewHeight * currentDpr;
        const base = 0.36 * clamp(s.scale ?? 1, 0.2, 4) * Math.min(w, 1.7 * h);
        return {
          incline: (clamp(s.tilt ?? 62, 0, 85) * Math.PI) / 180,
          roll: (clamp(s.roll ?? -8, -180, 180) * Math.PI) / 180,
          focal: 3.6 * base,
          center: [
            clamp(s.centerX ?? 0.5, -0.5, 1.5) * w,
            (1 - clamp(s.centerY ?? 0.52, -0.5, 1.5)) * h
          ] as [number, number]
        };
      };

      const projectPointerToDisc = (clientX: number, clientY: number) => {
        const rect = elem.getBoundingClientRect();
        const proj = getProjection();
        const px = (clientX - rect.left) * currentDpr;
        const py = (rect.height - (clientY - rect.top)) * currentDpr;
        const rx = (px - proj.center[0]) / proj.focal;
        const ry = (py - proj.center[1]) / proj.focal;
        const cosR = Math.cos(proj.roll);
        const sinR = Math.sin(proj.roll);
        const unrolledY = -sinR * rx + cosR * ry;
        const cosI = Math.cos(proj.incline);
        const sinI = Math.sin(proj.incline);
        const denom = cosI - unrolledY * sinI;
        if (denom <= 0.02) return null;
        const discY = (3.6 * unrolledY) / denom;
        return {
          x: (cosR * rx + sinR * ry) * (3.6 + discY * sinI),
          y: discY
        };
      };

      const triggerRipple = (x = 0, y = 0) => {
        const s = state.current;
        if (s.reduced || s.paused) return;
        const str = clamp(s.rippleStrength ?? 1, 0, 3);
        let newest = 0;
        let oldest = 0;
        for (let i = 1; i < 6; i++) {
          if (ripples[i].z > ripples[newest].z) newest = i;
          if (ripples[i].z < ripples[oldest].z) oldest = i;
        }
        const active = ripples[newest];
        if (active.w > 0 && realTime - active.z < 0.35 && Math.hypot(active.x - x, active.y - y) < 0.15) {
          active.w = Math.min(active.w + 0.3 * str, 1.6 * str);
        } else if (realTime - ripples[oldest].z > 7) {
          ripples[oldest].set(x, y, realTime, str);
        } else {
          active.w = Math.min(active.w + 0.25 * str, 1.6 * str);
        }
        requestFrame();
      };

      const hasActiveRipples = () => ripples.some(r => r.w > 0 && realTime - r.z < 7);

      const renderScene = () => {
        if (!mainRT || !downsampleRTs.length) return;
        rebuildGeometry();

        const s = state.current;
        const sUniforms = starsMaterial.uniforms;
        const w = viewWidth * currentDpr;
        const h = viewHeight * currentDpr;
        const proj = getProjection();

        const bgCol = parseColor(s.backgroundColor ?? '#0A0A0A', [0.04, 0.04, 0.04]);
        const bgLuminance = 0.2126 * bgCol[0] + 0.7152 * bgCol[1] + 0.0722 * bgCol[2];
        const isInk = s.mode === 'ink' || (s.mode === 'auto' && bgLuminance > 0.5);

        const colA = srgbToOklab(parseColor(s.colors?.[0] ?? '#7B4DFF', [0.48, 0.3, 1]));
        const colB = srgbToOklab(parseColor(s.colors?.[1] ?? '#FFC2EE', [1, 0.78, 0.95]));

        const numArms = Math.round(clamp(s.arms ?? 3, 1, 8));
        const armTwist = clamp(s.twist ?? 3.5, 0.5, 8);
        const aStrength = clamp(s.armStrength ?? 0.5, 0, 1);

        sUniforms.uResolution.value.set(w, h);
        sUniforms.uCenter.value.set(proj.center[0], proj.center[1]);
        sUniforms.uFocal.value = proj.focal;
        sUniforms.uIncline.value = proj.incline;
        sUniforms.uRoll.value = proj.roll;
        sUniforms.uPixelRatio.value = currentDpr;

        orbitUniforms.uTime.value = simTime;
        sUniforms.uRealTime.value = realTime;
        orbitUniforms.uArms.value = numArms;
        orbitUniforms.uTwist.value = armTwist;
        orbitUniforms.uEps.value = (0.92 * aStrength) / Math.sqrt(1 + numArms * numArms * armTwist * armTwist);

        sUniforms.uDust.value = clamp(s.dust ?? 0.5, 0, 1);
        sUniforms.uCore.value = clamp(s.core ?? 1, 0, 3);
        sUniforms.uVoid.value = clamp(s.innerVoid ?? 0, 0, 0.6);
        sUniforms.uSize.value = clamp(s.starSize ?? 1.7, 0.3, 6);
        sUniforms.uSparkle.value = 0.2 * clamp(s.sparkle ?? 0.5, 0, 1);
        sUniforms.uTwinkle.value = s.reduced ? 0 : clamp(s.twinkle ?? 0.35, 0, 1);
        sUniforms.uBack.value = 1 - clamp(s.depth ?? 0.4, 0, 1);
        sUniforms.uEnergy.value = energy;
        sUniforms.uInk.value = isInk ? 1 : 0;
        sUniforms.uLabA.value.set(colA[0], colA[1], colA[2]);
        sUniforms.uLabB.value.set(colB[0], colB[1], colB[2]);
        sUniforms.uActive.value = hasActiveRipples() ? 1 : 0;

        const starCount = Math.round(clamp(s.stars ?? 70000, 2000, 250000));
        const viewFactor = Math.pow(proj.focal / 3.6 / currentDpr / 380, 2);
        const kFactor = clamp(viewFactor, 0.2, 1);
        const mFactor = clamp(Math.pow(viewFactor, 0.25), 0.9, 1.22);

        points.geometry.setDrawRange(0, Math.round(starCount * kFactor));
        sUniforms.uSizeScale.value = mFactor;
        sUniforms.uStarGain.value =
          0.3 * Math.sqrt(60000 / starCount) * clamp(viewFactor / (kFactor * mFactor * mFactor), 0.5, 1.5);

        const compUnifs = compositeMaterial.uniforms;
        compUnifs.uBackground.value.set(srgbToLinear(bgCol[0]), srgbToLinear(bgCol[1]), srgbToLinear(bgCol[2]));
        compUnifs.uGlow.value = clamp(s.glow ?? 0.45, 0, 3);
        compUnifs.uExposure.value = (isInk ? 4.5 : 1) * clamp(s.intensity ?? 1, 0, 4) * (1 + 0.08 * energy);
        compUnifs.uMode.value = isInk ? 1 : 0;
        compUnifs.uGrain.value = grainOffset;

        renderer.setRenderTarget(mainRT);
        renderer.setClearColor(0, 0);
        renderer.clear();
        renderer.render(starsScene, orthoCamera);

        let curRT = mainRT;
        for (const rt of downsampleRTs) {
          downsampleMaterial.uniforms.uSource.value = curRT.texture;
          downsampleMaterial.uniforms.uTexel.value.set(1 / curRT.width, 1 / curRT.height);
          renderQuad(downsampleMaterial, rt);
          curRT = rt;
        }

        let bloomSource = downsampleRTs[downsampleRTs.length - 1];
        for (let i = downsampleRTs.length - 2; i >= 0; i--) {
          upsampleMaterial.uniforms.uSource.value = bloomSource.texture;
          upsampleMaterial.uniforms.uBase.value = downsampleRTs[i].texture;
          upsampleMaterial.uniforms.uTexel.value.set(1 / bloomSource.width, 1 / bloomSource.height);
          renderQuad(upsampleMaterial, upsampleRTs[i]);
          bloomSource = upsampleRTs[i];
        }

        compositeMaterial.uniforms.uLines.value = mainRT.texture;
        compositeMaterial.uniforms.uBloom.value = bloomSource.texture;
        renderQuad(compositeMaterial, null);
      };

      const getHoverTarget = () => {
        const s = state.current;
        return pointerState.inside && s.interactive && !s.reduced ? clamp(s.hoverBoost ?? 0.5, 0, 2) : 0;
      };

      const loop = (now: number) => {
        animFrameId = 0;
        if (destroyed) return;
        const dt = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
        lastTime = now;
        const s = state.current;

        energy += (getHoverTarget() - energy) * (1 - Math.exp(-dt / 0.5));

        if (!s.paused && !s.reduced) {
          realTime += dt;
          simTime += dt * clamp(s.speed ?? 1, -4, 4) * (1 + 0.25 * energy);
          grainOffset = (grainOffset + 0.618034) % 1;
        }

        rebuildGeometry();

        // Mouse wake update
        if (stateTargets.length && !s.paused && !s.reduced && dt > 0) {
          let gather = 0;
          let drag = 0;
          const trail = pointerState.trail;
          const disc = pointerState.disc;
          const wUnifs = wakeMaterial.uniforms;

          if (pointerState.inside && s.interactive && s.hoverWake && trail && disc) {
            const dist = Math.hypot(disc.x - trail.x, disc.y - trail.y);
            if (dist > 1e-5) {
              const speedVal = clamp((dist / Math.max(dt, 1 / 240) - 0.05) / 1.15, 0, 1);
              gather = 0.9 * clamp(s.wakeStrength ?? 1, 0, 3) * speedVal * speedVal * (3 - 2 * speedVal) * dist / (dist + 0.15948);
              drag = 0.25 * gather;
              wUnifs.uSegment.value.set(trail.x, trail.y, disc.x, disc.y);
              if (gather > 0) lastWakeTime = realTime;
            }
          }

          pointerState.trail = disc ? { x: disc.x, y: disc.y } : null;

          if (gather > 0 || realTime - lastWakeTime <= 24.5) {
            wUnifs.uGather.value = gather;
            wUnifs.uDrag.value = drag;
            wUnifs.uDecay.value = Math.exp(-dt / 3.5);
            wUnifs.uState.value = stateTargets[activeStateIndex].texture;
            wUnifs.uTime.value = simTime;

            quadMesh.material = wakeMaterial;
            renderer.setRenderTarget(stateTargets[1 - activeStateIndex]);
            renderer.render(quadScene, orthoCamera);
            activeStateIndex = 1 - activeStateIndex;
            starsMaterial.uniforms.uState.value = stateTargets[activeStateIndex].texture;
          }
        }

        renderScene();

        const needsContinuous = !s.paused && !s.reduced;
        const hasMomentum = Math.abs(energy - getHoverTarget()) > 0.002 || hasActiveRipples() || realTime - lastWakeTime < 24.5;

        if (isVisible && !document.hidden && (needsContinuous || hasMomentum)) {
          animFrameId = requestAnimationFrame(loop);
        }
      };

      function requestFrame() {
        if (!destroyed && !animFrameId && isVisible) {
          lastTime = performance.now();
          animFrameId = requestAnimationFrame(loop);
        }
      }

      const handleResize = () => {
        const rect = elem.getBoundingClientRect();
        viewWidth = Math.max(1, rect.width);
        viewHeight = Math.max(1, rect.height);
        currentDpr = Math.min(window.devicePixelRatio || 1, 1.25) * clamp(state.current.quality ?? 1, 0.25, 1);

        renderer.setPixelRatio(currentDpr);
        renderer.setSize(viewWidth, viewHeight, false);

        const pw = Math.round(viewWidth * currentDpr);
        const ph = Math.round(viewHeight * currentDpr);

        clearBloomRTs();
        mainRT = createRT(pw, ph);

        const mipLevels = clamp(Math.floor(Math.log2(Math.min(pw, ph) / 8)), 3, 7);
        for (let i = 1; i <= mipLevels; i++) {
          downsampleRTs.push(createRT(Math.max(1, pw >> i), Math.max(1, ph >> i)));
          upsampleRTs.push(createRT(Math.max(1, pw >> i), Math.max(1, ph >> i)));
        }

        renderScene();
        requestFrame();
      };

      let pointerMoveRaf = 0;
      let lastPointerEvent: PointerEvent | null = null;
      const processPointerMove = () => {
        pointerMoveRaf = 0;
        if (!lastPointerEvent) return;
        const e = lastPointerEvent;
        const s = state.current;
        if (e.pointerType === 'touch' || !s.interactive) return;
        if (!pointerState.inside) {
          pointerState.inside = true;
          pointerState.trail = null;
          requestFrame();
        }
        const pt = projectPointerToDisc(e.clientX, e.clientY);
        pointerState.disc = pt && Math.hypot(pt.x, pt.y) < 1.6 ? pt : null;
        if (!pointerState.disc) pointerState.trail = null;
        requestFrame();
      };

      const handlePointerMove = (e: PointerEvent) => {
        lastPointerEvent = e;
        if (!pointerMoveRaf) {
          pointerMoveRaf = requestAnimationFrame(processPointerMove);
        }
      };

      const handlePointerLeave = () => {
        if (pointerMoveRaf) {
          cancelAnimationFrame(pointerMoveRaf);
          pointerMoveRaf = 0;
        }
        pointerState.inside = false;
        pointerState.disc = null;
        pointerState.trail = null;
        requestFrame();
      };

      const handlePointerDown = (e: MouseEvent) => {
        const s = state.current;
        if (e.button !== 0 || !s.interactive || !s.clickRipple) return;
        const pt = projectPointerToDisc(e.clientX, e.clientY);
        const inside = pt && Math.hypot(pt.x, pt.y) < 1.2;
        triggerRipple(inside ? pt.x : 0, inside ? pt.y : 0);
      };

      elem.addEventListener('pointermove', handlePointerMove);
      elem.addEventListener('pointerleave', handlePointerLeave);
      elem.addEventListener('pointercancel', handlePointerLeave);
      elem.addEventListener('pointerdown', handlePointerDown);

      const resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(elem);

      const intersectionObserver = new IntersectionObserver(
        entries => {
          isVisible = entries.some(entry => entry.isIntersecting);
          if (isVisible) requestFrame();
        },
        { rootMargin: '80px' }
      );
      intersectionObserver.observe(elem);

      const handleVisibilityChange = () => {
        if (!document.hidden) requestFrame();
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);

      const handleContextLost = (e: Event) => e.preventDefault();
      canvas.addEventListener('webglcontextlost', handleContextLost);

      handleResize();

      return {
        sync: () => {
          const expectedDpr = Math.min(window.devicePixelRatio || 1, 2) * clamp(state.current.quality ?? 1, 0.25, 1);
          if (Math.abs(expectedDpr - currentDpr) > 0.001) {
            handleResize();
          } else {
            renderScene();
          }
          requestFrame();
        },
        destroy: () => {
          destroyed = true;
          cancelAnimationFrame(animFrameId);
          if (pointerMoveRaf) cancelAnimationFrame(pointerMoveRaf);
          elem.removeEventListener('pointermove', handlePointerMove);
          elem.removeEventListener('pointerleave', handlePointerLeave);
          elem.removeEventListener('pointercancel', handlePointerLeave);
          elem.removeEventListener('pointerdown', handlePointerDown);
          document.removeEventListener('visibilitychange', handleVisibilityChange);
          canvas.removeEventListener('webglcontextlost', handleContextLost);
          resizeObserver.disconnect();
          intersectionObserver.disconnect();
          clearBloomRTs();
          points.geometry.dispose();
          staticTexture?.dispose();
          stateTargets.forEach(rt => rt.dispose());
          quadGeom.dispose();
          [starsMaterial, wakeMaterial, downsampleMaterial, upsampleMaterial, compositeMaterial].forEach(m => m.dispose());
          renderer.dispose();
          renderer.forceContextLoss();
          canvas.remove();
        },
        ripple: () => triggerRipple(0, 0)
      };
    })(container, stateRef);

    engineRef.current = engine;
    return () => {
      engine?.destroy();
      engineRef.current = null;
    };
  }, []);

  useImperativeHandle(ref, () => ({
    ripple: () => engineRef.current?.ripple()
  }), []);

  return (
    <div
      ref={containerRef}
      className={cn('relative isolate h-full min-h-[240px] w-full overflow-hidden', className)}
      style={{ backgroundColor, ...style }}
    >
      {children && <div className="relative z-10 h-full w-full">{children}</div>}
    </div>
  );
});

BinaryOrbits.displayName = 'BinaryOrbits';

export default BinaryOrbits;
