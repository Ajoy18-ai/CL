import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';

// In-memory set of URLs that have already loaded successfully in this session
const loadedUrls = new Set<string>();

export function useCachedImage(src: string | null | undefined): string {
  return src || '';
}

export function precacheImages(urls: (string | null | undefined)[]) {
  if (typeof window === 'undefined') return;
  urls.forEach(url => {
    if (url && !loadedUrls.has(url)) {
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      img.onload = () => loadedUrls.add(url);
    }
  });
}

interface CachedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string | null | undefined;
}

export function CachedImage({ src, alt = '', className = '', ...props }: CachedImageProps) {
  const isAlreadyCached = src ? loadedUrls.has(src) : false;
  const [loaded, setLoaded] = useState(isAlreadyCached);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!src) return;
    if (loadedUrls.has(src)) {
      setLoaded(true);
      return;
    }
    if (imgRef.current && imgRef.current.complete && imgRef.current.naturalWidth > 0) {
      loadedUrls.add(src);
      setLoaded(true);
    }
  }, [src]);

  if (!src) {
    return <div className="relative w-full h-full bg-zinc-950" aria-hidden="true" />;
  }

  const handleLoad = () => {
    if (src) loadedUrls.add(src);
    setLoaded(true);
  };

  return (
    <div className="relative w-full h-full bg-zinc-950 overflow-hidden flex items-center justify-center contain-paint">
      {!loaded && (
        <div className="absolute inset-0 bg-zinc-900/60 hidden md:block md:animate-pulse" />
      )}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onLoad={handleLoad}
        className={`${className} transition-opacity duration-150 will-change-transform ${loaded ? 'opacity-100' : 'opacity-0'}`}
        {...props}
      />
    </div>
  );
}

export interface CachedMotionImageProps extends React.ComponentPropsWithoutRef<typeof motion.img> {
  src: string | null | undefined;
}

export function CachedMotionImage({ src, alt = '', className = '', ...props }: CachedMotionImageProps) {
  const isAlreadyCached = src ? loadedUrls.has(src) : false;
  const [loaded, setLoaded] = useState(isAlreadyCached);

  if (!src) {
    return <div className="relative w-full h-full bg-zinc-950" aria-hidden="true" />;
  }

  const handleLoad = () => {
    if (src) loadedUrls.add(src);
    setLoaded(true);
  };

  return (
    <div className="relative w-full h-full bg-zinc-950 overflow-hidden flex items-center justify-center contain-paint">
      {!loaded && (
        <div className="absolute inset-0 bg-zinc-900/60 hidden md:block md:animate-pulse" />
      )}
      <motion.img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onLoad={handleLoad}
        className={`${className} transition-opacity duration-150 will-change-transform ${loaded ? 'opacity-100' : 'opacity-0'}`}
        {...props}
      />
    </div>
  );
}
