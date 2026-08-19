import { useState, useCallback } from 'react';

const LAST_PROJECT_PATH_KEY = 'evo-harness:last-project-path';
const LAST_FILE_PATH_KEY = 'evo-harness:last-file-path';
const RECENT_FILES_KEY = 'evo-harness:recent-files';

const loadStoredString = (key: string) => {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(key) || '';
};

const loadStoredList = (key: string) => {
  if (typeof window === 'undefined') return [];
  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as string[]) : [];
  } catch {
    return [];
  }
};

export function useChatProject() {
  const [currentFilePath, setCurrentFilePath] = useState(() =>
    loadStoredString(LAST_FILE_PATH_KEY),
  );
  const [projectPath, setProjectPath] = useState(() =>
    loadStoredString(LAST_PROJECT_PATH_KEY),
  );
  const [recentFiles, setRecentFiles] = useState<string[]>(() =>
    loadStoredList(RECENT_FILES_KEY),
  );

  const rememberProjectPath = useCallback((path: string) => {
    setProjectPath(path);
    if (path) {
      window.localStorage.setItem(LAST_PROJECT_PATH_KEY, path);
    }
  }, []);

  const rememberFilePath = useCallback((path: string) => {
    if (!path) return;
    setCurrentFilePath(path);
    window.localStorage.setItem(LAST_FILE_PATH_KEY, path);
    setRecentFiles((prev) => {
      const next = [path, ...prev.filter((item) => item !== path)].slice(0, 8);
      window.localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return {
    currentFilePath,
    setCurrentFilePath,
    projectPath,
    setProjectPath: rememberProjectPath,
    recentFiles,
    rememberFilePath,
  };
}
