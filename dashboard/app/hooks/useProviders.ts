"use client";

import { useState, useEffect, useCallback } from "react";
import { ProviderConfig } from "@/app/types/robot";

export function useProviders(refreshInterval = 30000) {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ProviderConfig["id"]>("ollama");

  const fetchProviders = useCallback(async () => {
    try {
      const res = await fetch("/api/providers");
      const data = await res.json();
      setProviders(data.providers || []);
    } catch {
      setProviders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProviders();
    const interval = setInterval(fetchProviders, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchProviders, refreshInterval]);

  const activeProvider = providers.find((p) => p.id === selected) || providers[0];

  return {
    providers,
    loading,
    selected,
    setSelected,
    activeProvider,
    refresh: fetchProviders,
  };
}
