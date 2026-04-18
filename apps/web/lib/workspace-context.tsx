'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { api } from '@/lib/api';
import type { ApiResponse, Workspace } from '@livedoc/types';

// ─── Context shape ─────────────────────────────────────────────────────────────

interface WorkspaceContextValue {
  /** All workspaces the current user belongs to. */
  workspaces: Workspace[];
  /** The workspace currently selected in the sidebar. */
  activeWorkspace: Workspace | null;
  /** Switch the active workspace by id. */
  setActiveWorkspaceId: (id: string) => void;
  /** True while the initial workspace list is being fetched. */
  isLoading: boolean;
  /** Re-fetches the workspace list (e.g. after creating or deleting one). */
  refetch: () => Promise<void>;
  /** Creates a workspace, refreshes the list, and auto-selects the new one. */
  createWorkspace: (name: string, slug: string) => Promise<Workspace>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

// ─── Local-storage key for persisting the active workspace across reloads ──────

const STORAGE_KEY = 'livedoc:activeWorkspaceId';

// ─── Provider ──────────────────────────────────────────────────────────────────

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, _setActiveWorkspaceId] = useState<string | null>(
    () =>
      typeof window !== 'undefined'
        ? (localStorage.getItem(STORAGE_KEY) ?? null)
        : null,
  );
  const [isLoading, setIsLoading] = useState(true);

  // Persist active workspace in localStorage whenever it changes
  const setActiveWorkspaceId = useCallback((id: string) => {
    localStorage.setItem(STORAGE_KEY, id);
    _setActiveWorkspaceId(id);
  }, []);

  const fetchWorkspaces = useCallback(async () => {
    try {
      const res = await api.get<ApiResponse<Workspace[]>>('/api/workspaces');
      if (res.data && res.data.length > 0) {
        setWorkspaces(res.data);

        // Keep the persisted selection when it is still valid;
        // otherwise fall back to the first workspace in the list.
        _setActiveWorkspaceId((prev) => {
          const stillValid = prev && res.data!.some((w) => w.id === prev);
          if (stillValid) return prev;
          const first = res.data![0].id;
          localStorage.setItem(STORAGE_KEY, first);
          return first;
        });
      } else {
        setWorkspaces([]);
        _setActiveWorkspaceId(null);
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Auth redirect is handled by the layout; silently ignore network errors here.
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  const createWorkspace = useCallback(
    async (name: string, slug: string): Promise<Workspace> => {
      const res = await api.post<ApiResponse<Workspace>>('/api/workspaces', {
        name,
        slug,
      });
      if (res.error) throw new Error(res.error.message);
      const created = res.data!;
      await fetchWorkspaces();
      setActiveWorkspaceId(created.id);
      return created;
    },
    [fetchWorkspaces, setActiveWorkspaceId],
  );

  const activeWorkspace =
    workspaces.find((w) => w.id === activeWorkspaceId) ?? null;

  return (
    <WorkspaceContext.Provider
      value={{
        workspaces,
        activeWorkspace,
        setActiveWorkspaceId,
        isLoading,
        refetch: fetchWorkspaces,
        createWorkspace,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error('useWorkspace() must be called inside <WorkspaceProvider>.');
  }
  return ctx;
}
