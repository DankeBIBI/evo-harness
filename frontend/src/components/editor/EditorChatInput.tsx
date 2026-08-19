import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import {
    Check,
    ChevronDown,
    ChevronUp,
    Keyboard,
    ListTodo,
    RotateCcw,
    Send,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TodoList } from '../chat/panels/TodoList';

interface EditorChatInputProps {
    input: string;
    onInputChange: (value: string) => void;
    onSend: () => void;
    pendingCount: number;
    acceptedCount: number;
    onAcceptAll: () => void;
    onRevertAll: () => void;
}

export function EditorChatInput({
    input,
    onInputChange,
    onSend,
    pendingCount,
    acceptedCount,
    onAcceptAll,
    onRevertAll,
}: EditorChatInputProps) {
    const [showTodo, setShowTodo] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSend();
            }
        },
        [onSend],
    );

    // 快捷键: Ctrl+Enter 接受 / Ctrl+Backspace 撤销
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                onAcceptAll();
            }
            if (e.ctrlKey && e.key === 'Backspace') {
                e.preventDefault();
                onRevertAll();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onAcceptAll, onRevertAll]);

    const statusText = useMemo(() => {
        if (pendingCount > 0) return `接受 ${pendingCount} 个文件的编辑`;
        if (acceptedCount > 0) return `已接受 ${acceptedCount} 个文件`;
        return '没有待处理的编辑';
    }, [pendingCount, acceptedCount]);

    return (
        <div className="border-t border-border bg-card">
            {/* 待办事项面板 */}
            {showTodo && (
                <div className="border-b border-border">
                    <TodoList className="max-h-[280px]" />
                </div>
            )}

            {/* 操作栏 */}
            <div className="flex items-center justify-between px-4 py-2">
                <div className="flex items-center gap-3">
                    {/* 待办切换 */}
                    <Button
                        className="h-7 gap-1.5 text-xs"
                        onClick={() => setShowTodo(!showTodo)}
                        size="sm"
                        variant="ghost"
                    >
                        <ListTodo className="h-[14px] w-[14px]" />
                        待办
                        {showTodo ? (
                            <ChevronUp className="h-[12px] w-[12px]" />
                        ) : (
                            <ChevronDown className="h-[12px] w-[12px]" />
                        )}
                    </Button>

                    {/* 状态 */}
                    <div className="flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                        <Check className="h-[14px] w-[14px]" />
                        <span>{statusText}</span>
                    </div>

                    {pendingCount > 0 && (
                        <div className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
                            <Keyboard className="h-[14px] w-[14px]" />
                            <span>Ctrl+Enter 接受 / Ctrl+Backspace 撤销</span>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-1.5">
                    <Button
                        className="h-7 gap-1.5 text-xs"
                        disabled={pendingCount === 0}
                        onClick={onRevertAll}
                        size="sm"
                        variant="ghost"
                    >
                        <RotateCcw className="h-[14px] w-[14px]" />
                        撤销全部
                    </Button>
                    <Button
                        className="h-7 gap-1.5 text-xs"
                        disabled={pendingCount === 0}
                        onClick={onAcceptAll}
                        size="sm"
                    >
                        <Check className="h-[14px] w-[14px]" />
                        接受全部
                    </Button>
                </div>
            </div>

            {/* 输入框区域 */}
            <div className="px-4 pb-4 pt-1">
                <div className="flex gap-2">
                    <Textarea
                        className="min-h-[60px] resize-none text-sm"
                        onChange={(e) => onInputChange(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="描述你的需求，例如：帮我重构这个组件，添加错误处理..."
                        ref={textareaRef}
                        value={input}
                    />
                    <Button
                        className="h-auto shrink-0 px-3"
                        disabled={!input.trim()}
                        onClick={onSend}
                    >
                        <Send className="h-5 w-5" />
                    </Button>
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                    Enter 发送 · Shift+Enter 换行
                </p>
            </div>
        </div>
    );
}
