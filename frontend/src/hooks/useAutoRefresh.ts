import { useEffect, useRef, useCallback } from 'react';

interface UseAutoRefreshOptions {
  interval?: number; // in milliseconds, default 5000 (5 seconds)
  enabled?: boolean;
  onRefresh: () => void | Promise<void>;
}

/**
 * Hook for auto-refreshing data at regular intervals
 * This does NOT reset component state - only calls the refresh function
 * Use this to update data from DB while keeping UI state (open forms, dialogs, etc.)
 */
export const useAutoRefresh = ({
  interval = 200,
  enabled = true,
  onRefresh,
}: UseAutoRefreshOptions) => {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const onRefreshRef = useRef(onRefresh);

  // Update ref when onRefresh changes (avoid stale closure)
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  const startRefresh = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    intervalRef.current = setInterval(() => {
      onRefreshRef.current();
    }, interval);
  }, [interval]);

  const stopRefresh = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const manualRefresh = useCallback(() => {
    onRefreshRef.current();
  }, []);

  useEffect(() => {
    if (enabled) {
      startRefresh();
    } else {
      stopRefresh();
    }

    return () => {
      stopRefresh();
    };
  }, [enabled, startRefresh, stopRefresh]);

  return {
    manualRefresh,
    startRefresh,
    stopRefresh,
  };
};

/**
 * Hook for real-time updates (more frequent, for boards/cards)
 * Uses 200ms interval for ultra real-time Trello-like updates
 */
export const useRealTimeRefresh = (onRefresh: () => void | Promise<void>, enabled = true) => {
  return useAutoRefresh({
    interval: 200, // 200ms for ultra real-time feel 
    enabled,
    onRefresh,
  });
};
