import { useState, useRef, useCallback, useEffect, memo } from 'react';
import {
  MessageSquare,
  Trash2,
  Send,
  Paperclip,
  Square,
  PanelRightClose,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChatMessage } from '@/types';

interface AssistantPanelProps {
  open: boolean;
  onClose: () => void;
  selectedModel?: string;
}

const QUICK_PROMPTS = [
  'How do I clean chrome cards?',
  'What scanner settings work best?',
  'Explain the cleanup strength slider',
  'Help with batch processing',
];

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export default memo(function AssistantPanel({ open, onClose, selectedModel }: AssistantPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    const userMsg: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsStreaming(true);

    const assistantId = generateId();
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: 'assistant', content: '', timestamp: Date.now() },
    ]);

    abortRef.current = new AbortController();

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMsg].map((m) => ({ role: m.role, content: m.content })),
          model: selectedModel,
        }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`Chat request failed: ${response.status}`);
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data:')) continue;
            const data = trimmed.slice(5).trim();
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const delta = parsed?.choices?.[0]?.delta?.content;
              if (typeof delta === 'string') {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, content: m.content + delta } : m,
                  ),
                );
              }
            } catch {
              // skip malformed
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: 'Sorry, an error occurred. Please try again.' }
              : m,
          ),
        );
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [input, isStreaming, messages, selectedModel]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleClear = useCallback(() => {
    setMessages([]);
  }, []);

  const handleQuickPrompt = useCallback(
    (prompt: string) => {
      setInput(prompt);
      textareaRef.current?.focus();
    },
    [],
  );

  const handleFileAttach = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          setMessages((prev) => [
            ...prev,
            {
              id: generateId(),
              role: 'user',
              content: `Attached: ${file.name}`,
              attachments: [{ filename: file.name, dataUrl }],
              timestamp: Date.now(),
            },
          ]);
        };
        reader.readAsDataURL(file);
      }
    };
    input.click();
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }
  }, [input]);

  if (!open) return null;

  return (
    <aside className="h-full w-[340px] shrink-0 bg-app-panel border-l border-border-subtle flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border-subtle">
        <div className="flex items-center gap-2">
          <MessageSquare className="size-4 text-text-secondary" strokeWidth={1.5} />
          <span className="text-sm font-semibold text-text-primary">Assistant</span>
          {selectedModel && (
            <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-status-info/10 text-status-info border border-status-info/20">
              {selectedModel.length > 15 ? selectedModel.slice(0, 12) + '...' : selectedModel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleClear}
            className="p-1.5 rounded-sm text-text-tertiary hover:text-text-secondary hover:bg-app-panel-hover transition-colors"
            title="Clear conversation"
          >
            <Trash2 className="size-3.5" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-sm text-text-tertiary hover:text-text-secondary hover:bg-app-panel-hover transition-colors"
            title="Close panel"
          >
            <PanelRightClose className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="space-y-3">
            <div className="text-center py-6">
              <MessageSquare className="size-8 mx-auto text-text-tertiary mb-2" />
              <p className="text-sm text-text-secondary">AI Assistant</p>
              <p className="text-xs text-text-tertiary mt-1">
                Ask about card cleaning, materials, or settings.
              </p>
            </div>
            {/* Quick prompts */}
            <div className="flex flex-wrap gap-2">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => handleQuickPrompt(prompt)}
                  className="text-xs px-3 py-1.5 rounded-full bg-app-panel-hover text-text-secondary hover:bg-app-panel-active hover:text-text-primary transition-colors border border-border-subtle"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              'flex',
              msg.role === 'user' ? 'justify-end' : 'justify-start',
            )}
          >
            <div
              className={cn(
                'max-w-[90%] rounded-md px-3.5 py-2.5 text-sm',
                msg.role === 'user'
                  ? 'bg-app-panel-active text-text-primary rounded-tr-sm'
                  : 'bg-app-panel text-text-primary border border-border-subtle rounded-tl-sm',
              )}
            >
              <p className="whitespace-pre-wrap break-words">{msg.content}</p>
              {msg.attachments?.map((att) => (
                <img
                  key={att.filename}
                  src={att.dataUrl}
                  alt={att.filename}
                  className="mt-2 max-h-32 rounded-md object-contain"
                />
              ))}
              <span className="block mt-1 text-[10px] text-text-tertiary">
                {new Date(msg.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          </div>
        ))}

        {isStreaming && messages[messages.length - 1]?.content === '' && (
          <div className="flex justify-start">
            <div className="bg-app-panel border border-border-subtle rounded-md rounded-tl-sm px-3.5 py-2.5">
              <Loader2 className="size-4 animate-spin text-status-processing" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border-subtle px-3 py-2.5">
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about card cleaning, materials, settings..."
            className="w-full bg-app-input border border-border-subtle rounded-md px-3 py-2 pr-20 text-sm text-text-primary placeholder:text-text-tertiary resize-none min-h-[40px] max-h-[120px] focus:outline-none focus:border-border-accent"
            rows={1}
          />
          <div className="absolute right-1.5 bottom-1.5 flex items-center gap-1">
            <button
              onClick={handleFileAttach}
              className="p-1.5 rounded-sm text-text-tertiary hover:text-text-secondary hover:bg-app-panel-hover transition-colors"
              title="Attach file"
            >
              <Paperclip className="size-4" />
            </button>
            {isStreaming ? (
              <button
                onClick={handleStop}
                className="p-1.5 rounded-sm bg-status-error text-white hover:opacity-90 transition-opacity"
                title="Stop generating"
              >
                <Square className="size-4" />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className={cn(
                  'p-1.5 rounded-sm transition-colors',
                  input.trim()
                    ? 'bg-status-info text-white hover:brightness-110'
                    : 'bg-app-panel-hover text-text-disabled cursor-not-allowed',
                )}
                title="Send message"
              >
                <Send className="size-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
});
