import React, { useRef, useEffect, useState } from 'react';
import { Renderer, Program, Triangle, Mesh } from 'ogl';
import './DarkVeil.css';

const hexToRgb = (hex: string): [number, number, number] => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m
    ? [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255]
    : [0, 0, 0];
};

export interface DarkVeilProps {
  speed?: number;
  baseColor?: string;
  veilColor?: string;
  opacity?: number;
  className?: string;
}

const DarkVeil: React.FC<DarkVeilProps> = ({
  speed = 0.8,
  baseColor = '#03000a',
  veilColor = '#5a2ea6',
  opacity = 0.5,
  className = ''
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const uniformsRef = useRef<any>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const animationIdRef = useRef<number | null>(null);
  const meshRef = useRef<Mesh | null>(null);
  const cleanupFunctionRef = useRef<(() => void) | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    observerRef.current = new IntersectionObserver(
      entries => {
        const entry = entries[0];
        setIsVisible(entry.isIntersecting);
      },
      { threshold: 0.1 }
    );

    observerRef.current.observe(containerRef.current);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isVisible || !containerRef.current) return;

    let isCancelled = false;

    if (cleanupFunctionRef.current) {
      cleanupFunctionRef.current();
      cleanupFunctionRef.current = null;
    }

    const initializeWebGL = async () => {
      if (!containerRef.current) return;

      // Small delay to ensure container dimensions are set
      await new Promise(resolve => setTimeout(resolve, 10));

      if (isCancelled || !containerRef.current) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 0.75);
      const renderer = new Renderer({
        dpr,
        alpha: true,
        powerPreference: 'low-power'
      });

      if (isCancelled) {
        try {
          const loseCtx = renderer.gl.getExtension('WEBGL_lose_context');
          if (loseCtx) loseCtx.loseContext();
        } catch (e) {}
        return;
      }

      rendererRef.current = renderer;

      const gl = renderer.gl;
      gl.canvas.style.width = '100%';
      gl.canvas.style.height = '100%';

      // Clear any existing canvas
      while (containerRef.current.firstChild) {
        containerRef.current.removeChild(containerRef.current.firstChild);
      }
      containerRef.current.appendChild(gl.canvas);

      const vert = `
attribute vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}`;

      const frag = `precision mediump float;

uniform float iTime;
uniform vec2 iResolution;
uniform vec3 iBaseColor;
uniform vec3 iVeilColor;
uniform float iSpeed;
uniform float iOpacity;

void main() {
  vec2 uv = gl_FragCoord.xy / iResolution.xy;

  // Center coordinates [-1, 1]
  vec2 p = uv * 2.0 - 1.0;
  p.x *= iResolution.x / iResolution.y;

  float time = iTime * iSpeed;

  // Overlaying translucent silk-like veil wave curves
  float veil1 = sin(p.x * 1.2 + sin(p.y + time) * 0.9 + time) * 0.5 + 0.5;
  veil1 *= cos(p.y * 1.8 + cos(p.x - time * 0.5) * 0.7) * 0.5 + 0.5;

  float veil2 = sin(p.x * 1.8 - cos(p.y - time * 0.6) * 1.2 + time * 1.1) * 0.5 + 0.5;
  veil2 *= cos(p.y * 1.2 + sin(p.x + time * 0.7) * 0.9) * 0.5 + 0.5;

  float veil3 = sin(p.y * 2.5 + sin(p.x + time * 1.3) * 1.5 + time * 0.8) * 0.5 + 0.5;

  // Combine veil layers to create an organic, moving cloth fold effect
  float intensity = pow(veil1, 3.5) * 0.55 + pow(veil2, 4.0) * 0.45 + pow(veil3, 5.0) * 0.25;

  // Mix beautiful moody tones
  vec3 col = mix(iBaseColor, iVeilColor, intensity);

  // Soft vignette / edge-falloff to blend gracefully with solid backgrounds
  float vignette = uv.x * (1.0 - uv.x) * uv.y * (1.0 - uv.y) * 16.0;
  vignette = clamp(pow(vignette, 0.4), 0.0, 1.0);

  col *= vignette;

  // Cinematic film grain overlay
  float grain = fract(sin(dot(uv + fract(time * 0.05), vec2(12.9898, 78.233))) * 43758.5453);
  col += vec3(grain * 0.015);

  gl_FragColor = vec4(col, intensity * iOpacity * vignette);
}`;

      const uniforms = {
        iTime: { value: 0 },
        iResolution: { value: [1, 1] },
        iSpeed: { value: speed },
        iBaseColor: { value: hexToRgb(baseColor) },
        iVeilColor: { value: hexToRgb(veilColor) },
        iOpacity: { value: opacity }
      };
      uniformsRef.current = uniforms;

      const geometry = new Triangle(gl);
      const program = new Program(gl, { vertex: vert, fragment: frag, uniforms });
      const mesh = new Mesh(gl, { geometry, program });
      meshRef.current = mesh;

      const updateSize = () => {
        if (isCancelled || !containerRef.current || !renderer) return;
        const currentDpr = Math.min(window.devicePixelRatio || 1, 0.75);
        renderer.dpr = currentDpr;
        const { clientWidth: w, clientHeight: h } = containerRef.current;
        renderer.setSize(w, h);
        uniforms.iResolution.value = [w * currentDpr, h * currentDpr];
      };

      let isPaused = false;
      let lastRenderTime = 0;
      const targetFrameInterval = 1000 / 30; // 30 FPS cap for ambient background is butter smooth

      const handleVisibilityChange = () => {
        if (document.hidden) {
          isPaused = true;
          if (animationIdRef.current) {
            cancelAnimationFrame(animationIdRef.current);
            animationIdRef.current = null;
          }
        } else {
          if (isPaused && !isCancelled) {
            isPaused = false;
            lastRenderTime = 0;
            animationIdRef.current = requestAnimationFrame(loop);
          }
        }
      };

      const handleContextLost = (e: Event) => {
        e.preventDefault();
        isCancelled = true;
        if (animationIdRef.current) {
          cancelAnimationFrame(animationIdRef.current);
          animationIdRef.current = null;
        }
        console.warn('WebGL context lost for DarkVeil');
      };

      gl.canvas.addEventListener('webglcontextlost', handleContextLost, false);
      document.addEventListener('visibilitychange', handleVisibilityChange);

      const loop = (t: number) => {
        if (isCancelled || isPaused || !rendererRef.current || !uniformsRef.current || !meshRef.current) return;

        const delta = t - lastRenderTime;
        if (delta >= targetFrameInterval) {
          lastRenderTime = t - (delta % targetFrameInterval);
          uniforms.iTime.value = t * 0.001;
          try {
            renderer.render({ scene: mesh });
          } catch (e) {
            return;
          }
        }

        animationIdRef.current = requestAnimationFrame(loop);
      };

      window.addEventListener('resize', updateSize);
      updateSize();
      animationIdRef.current = requestAnimationFrame(loop);

      cleanupFunctionRef.current = () => {
        isCancelled = true;
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        if (gl && gl.canvas) {
          gl.canvas.removeEventListener('webglcontextlost', handleContextLost);
        }
        if (animationIdRef.current) {
          cancelAnimationFrame(animationIdRef.current);
          animationIdRef.current = null;
        }
        window.removeEventListener('resize', updateSize);
        if (renderer) {
          try {
            const loseCtx = renderer.gl.getExtension('WEBGL_lose_context');
            if (loseCtx) loseCtx.loseContext();
            const canvas = renderer.gl.canvas;
            if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
          } catch (e) {}
        }
        rendererRef.current = null;
        uniformsRef.current = null;
        meshRef.current = null;
      };
    };

    initializeWebGL();

    return () => {
      isCancelled = true;
      if (cleanupFunctionRef.current) {
        cleanupFunctionRef.current();
        cleanupFunctionRef.current = null;
      }
    };
  }, [isVisible, speed, baseColor, veilColor, opacity]);

  useEffect(() => {
    if (!uniformsRef.current) return;
    const u = uniformsRef.current;
    u.iSpeed.value = speed;
    u.iBaseColor.value = hexToRgb(baseColor);
    u.iVeilColor.value = hexToRgb(veilColor);
    u.iOpacity.value = opacity;
  }, [speed, baseColor, veilColor, opacity]);

  return <div ref={containerRef} className={`dark-veil-container ${className}`.trim()} />;
};

export default DarkVeil;
