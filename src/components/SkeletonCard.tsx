import React from 'react';

export const SkeletonCard: React.FC = () => (
  <div className="flex flex-col bg-white dark:bg-[#111114] border border-zinc-200 dark:border-zinc-800/90 rounded-xl overflow-hidden animate-pulse">
    <div className="aspect-[4/3] bg-zinc-200 dark:bg-zinc-900" />
    <div className="p-5 space-y-3">
      <div className="h-3 w-2/3 bg-zinc-200 dark:bg-zinc-800 rounded" />
      <div className="h-5 w-4/5 bg-zinc-200 dark:bg-zinc-800 rounded" />
      <div className="h-4 w-full bg-zinc-200 dark:bg-zinc-800 rounded" />
      <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/80 flex justify-between">
        <div className="h-3 w-16 bg-zinc-200 dark:bg-zinc-800 rounded" />
        <div className="h-3 w-20 bg-zinc-200 dark:bg-zinc-800 rounded" />
      </div>
    </div>
  </div>
);
