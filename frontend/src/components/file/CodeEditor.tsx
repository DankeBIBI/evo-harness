import type { editor } from 'monaco-editor';

import { Button } from '@/components/ui/Button';
import Editor, { OnChange, OnMount } from '@monaco-editor/react';
import { Redo, RotateCcw, Save, Undo } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

interface CodeEditorProps {
  filePath: string;
  initialContent: string;
  onClose?: () => void;
  onSave?: (content: string) => void;
  readOnly?: boolean;
}

export function CodeEditor({
  filePath,
  initialContent,
  onClose,
  onSave,
  readOnly = false,
}: CodeEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const [content, setContent] = useState(initialContent);
  const [originalContent] = useState(initialContent);
  const [hasChanges, setHasChanges] = useState(false);

  // 初始化编辑器
  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor;
    editor.focus();
  };

  // 内容变化
  const handleChange: OnChange = (value) => {
    const newContent = value || '';
    setContent(newContent);
    setHasChanges(newContent !== originalContent);
  };

  // 保存
  const handleSave = useCallback(async () => {
    if (!editorRef.current) return;

    try {
      const { WriteFile } = await import('@/lib/hostServices/FileService');
      await WriteFile(filePath, content);
      setHasChanges(false);
      onSave?.(content);
    } catch (error) {
      console.error('保存失败:', error);
    }
  }, [content, filePath, onSave]);

  // 撤销
  const handleUndo = () => {
    editorRef.current?.trigger('keyboard', 'undo', null);
  };

  // 重做
  const handleRedo = () => {
    editorRef.current?.trigger('keyboard', 'redo', null);
  };

  // 重置
  const handleReset = () => {
    editorRef.current?.setValue(originalContent);
    setContent(originalContent);
    setHasChanges(false);
  };

  // 获取语言
  const getLanguage = (path: string): string => {
    const ext = path.split('.').pop()?.toLowerCase() || '';
    const langMap: Record<string, string> = {
      bash: 'shell',
      c: 'c',
      cpp: 'cpp',
      cs: 'csharp',
      css: 'css',
      dockerfile: 'dockerfile',
      fish: 'shell',
      go: 'go',
      graphql: 'graphql',
      html: 'html',
      java: 'java',
      js: 'javascript',
      json: 'json',
      jsx: 'javascript',
      kt: 'kotlin',
      less: 'less',
      md: 'markdown',
      php: 'php',
      ps1: 'powershell',
      psm1: 'powershell',
      py: 'python',
      rb: 'ruby',
      rs: 'rust',
      scss: 'scss',
      sh: 'shell',
      sql: 'sql',
      swift: 'swift',
      toml: 'toml',
      ts: 'typescript',
      tsx: 'typescript',
      vue: 'vue',
      xml: 'xml',
      yaml: 'yaml',
      yml: 'yaml',
      zsh: 'shell',
    };
    return langMap[ext] || 'plaintext';
  };

  // 获取文件名
  const fileName = filePath.split(/[/\\]/).pop() || '未命名';

  return (
    <div className="flex h-full flex-col bg-gray-900">
      {/* 头部工具栏 */}
      <div className="flex items-center gap-2 border-b border-gray-700 bg-gray-800 px-3 py-2">
        <span className="flex-1 truncate text-sm font-medium text-gray-300">
          {fileName}
          {hasChanges && <span className="ml-1 text-yellow-500">•</span>}
        </span>

        <div className="flex items-center gap-1">
          <Button
            disabled={readOnly}
            onClick={handleUndo}
            size="sm"
            title="撤销"
            variant="ghost"
          >
            <Undo className="" />
          </Button>
          <Button
            disabled={readOnly}
            onClick={handleRedo}
            size="sm"
            title="重做"
            variant="ghost"
          >
            <Redo className="" />
          </Button>
          <Button
            disabled={readOnly || !hasChanges}
            onClick={handleReset}
            size="sm"
            title="重置"
            variant="ghost"
          >
            <RotateCcw className="" />
          </Button>
          <Button
            disabled={readOnly || !hasChanges}
            onClick={handleSave}
            size="sm"
            title="保存"
            variant="ghost"
          >
            <Save className="" />
          </Button>
        </div>
      </div>

      {/* 路径显示 */}
      <div className="bg-gray-850 truncate px-3 py-1 text-xs text-gray-500">
        {filePath}
      </div>

      {/* 编辑器主体 */}
      <div className="flex-1">
        <Editor
          height="100%"
          language={getLanguage(filePath)}
          onChange={handleChange}
          onMount={handleEditorMount}
          options={{
            automaticLayout: true,
            bracketPairColorization: { enabled: true },
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
            fontFamily: "'Fira Code', 'Cascadia Code', Consolas, monospace",
            fontLigatures: true,
            fontSize: 14,
            minimap: { enabled: true },
            padding: { top: 8 },
            readOnly,
            renderWhitespace: 'selection',
            scrollBeyondLastLine: false,
            smoothScrolling: true,
          }}
          theme="vs-dark"
          value={content}
        />
      </div>
    </div>
  );
}
