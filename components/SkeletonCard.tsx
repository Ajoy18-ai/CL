import React from 'react';
import { motion } from 'motion/react';

interface SkeletonCardProps {
  viewMode?: 'grid' | 'list';
  type?: 'dashboard' | 'search';
}

export const SkeletonCard: React.FC<SkeletonCardProps> = ({
  viewMode = 'grid',
  type = 'dashboard'
}) => {
  if (viewMode === 'list') {
    return (
      <div className="flex items-center gap-6 py-6 px-4 border-b border-white/[0.04] animate-pulse">
        {/* Index Skeleton */}
        <div className="w-10 shrink-0">
          <div className="h-4 bg-zinc-800 rounded-md w-6" />
        </div>

        {/* Thumbnail Skeleton */}
        <div className="w-16 h-24 md:w-20 md:h-28 shrink-0 rounded-xl bg-zinc-900 border border-white/5 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-zinc-800/20 to-transparent animate-shimmer" style={{ backgroundSize: '200% 100%' }} />
        </div>

        {/* Details Skeleton */}
        <div className="flex-1 min-w-0 space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-5 bg-zinc-850 rounded-xl w-1/3 md:w-1/4" />
            <div className="h-3 bg-zinc-900 rounded-md w-12" />
          </div>
          <div className="flex items-center gap-4">
            <div className="h-6 bg-zinc-900 rounded-lg w-20" />
            <div className="h-5 bg-zinc-900 rounded-lg w-16" />
          </div>
        </div>

        {/* Date Skeleton */}
        <div className="hidden md:block shrink-0 px-6">
          <div className="h-4 bg-zinc-900 rounded-md w-20" />
        </div>

        {/* Action Skeleton */}
        <div className="hidden lg:flex items-center gap-6">
          <div className="w-5 h-5 bg-zinc-900 rounded-full" />
          <div className="w-5 h-5 bg-zinc-900 rounded-full" />
        </div>
      </div>
    );
  }

  // Grid view
  if (type === 'search') {
    return (
      <div className="flex flex-col gap-3 group text-left relative animate-pulse">
        {/* Poster Container */}
        <div className="relative aspect-[2/3] rounded-2xl overflow-hidden bg-zinc-900 border border-white/5 shadow-xl">
          <div className="w-full h-full bg-zinc-900/50" />
        </div>

        {/* Info */}
        <div className="px-1 space-y-2">
          <div className="h-4 bg-zinc-850 rounded-lg w-3/4" />
          <div className="h-3 bg-zinc-900 rounded-md w-1/4" />
        </div>
      </div>
    );
  }

  // Dashboard Grid
  return (
    <div className="group animate-pulse">
      {/* Poster Container */}
      <div className="relative w-full aspect-[2/3] rounded-2xl md:rounded-3xl overflow-hidden shadow-2xl shadow-black/40 mb-3 md:mb-4 bg-zinc-900 border border-white/5">
        <div className="w-full h-full bg-zinc-900/50" />
      </div>

      {/* Title & Meta */}
      <div className="space-y-2 px-1">
        <div className="h-4 bg-zinc-850 rounded-lg w-4/5 mx-auto md:mx-0" />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-zinc-800" />
            <div className="h-3 bg-zinc-900 rounded-md w-12" />
          </div>
          <div className="h-3 bg-zinc-900 rounded-md w-16" />
        </div>
      </div>
    </div>
  );
};

interface SkeletonGridProps {
  count?: number;
  viewMode?: 'grid' | 'list';
  type?: 'dashboard' | 'search';
}

export const SkeletonGrid: React.FC<SkeletonGridProps> = ({
  count = 10,
  viewMode = 'grid',
  type = 'dashboard'
}) => {
  const items = Array.from({ length: count });

  if (viewMode === 'list') {
    return (
      <div className="grid grid-cols-1 max-w-2xl mx-auto divide-y divide-white/[0.02]">
        {items.map((_, i) => (
          <SkeletonCard key={i} viewMode="list" type={type} />
        ))}
      </div>
    );
  }

  if (type === 'search') {
    return (
      <div className="grid gap-4 lg:gap-6 px-0 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {items.map((_, i) => (
          <SkeletonCard key={i} viewMode="grid" type={type} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-3 gap-y-8 md:gap-x-4 md:gap-y-12 px-0 md:px-0">
      {items.map((_, i) => (
        <SkeletonCard key={i} viewMode="grid" type={type} />
      ))}
    </div>
  );
};
