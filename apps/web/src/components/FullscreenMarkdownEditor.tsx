import { BlockNoteView } from '@blocknote/mantine';
import { useCreateBlockNote } from '@blocknote/react';
import { Button, Chip } from '@heroui/react';
import * as React from 'react';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';

type ViewMode = 'rich' | 'source' | 'split';

type Props = {
  open: boolean;
  onClose: () => void;
  value: string;
  onChange?: (markdown: string) => void;
  readOnly?: boolean;
  title?: string;
  subtitle?: string;
  placeholder?: string;
  theme?: 'light' | 'dark';
};

// minimal word count helper
function countWords(md: string): { words: number; chars: number; lines: number } {
  const chars = md.length;
  const lines = md ? md.split('\n').length : 0;
  // crude word count: split by whitespace and CJK?
  const words = md.trim() ? md.trim().split(/\s+/).length : 0;
  return { words, chars, lines };
}

function CloseIcon(): React.JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

export function FullscreenMarkdownEditor(props: Props): React.JSX.Element | null {
  const { open, onClose, value, onChange, readOnly = false, title, placeholder, theme } = props;
  const [viewMode, setViewMode] = React.useState<ViewMode>('rich');
  const [sourceDraft, setSourceDraft] = React.useState(value);
  const [markdownCache, setMarkdownCache] = React.useState(value);
  const [copied, setCopied] = React.useState(false);

  // Keep sourceDraft in sync when value changes externally and not editing source
  React.useEffect(() => {
    if (!open) return;
    setSourceDraft(value);
    setMarkdownCache(value);
  }, [value, open]);

  const effectiveTheme =
    theme ??
    (typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
      ? 'dark'
      : 'light');

  const editor = useCreateBlockNote({
    uploadFile: async (file: File) => {
      // For demo: create object URL. In production, upload to server/CDN.
      // File panel will show uploaded image inline.
      return URL.createObjectURL(file);
    },
    // allow all default blocks + toggles; keep empty initialContent, will replace via effect
    // placeholder hint via dictionary not needed; BlockNote uses empty block placeholder
  });

  const lastExternalRef = React.useRef<string>(value);
  const lastEmittedRef = React.useRef<string>(value);
  const syncingRef = React.useRef(false);

  // when open or value changes, sync to editor
  React.useEffect(() => {
    if (!open) return;
    if (value === lastEmittedRef.current && value === lastExternalRef.current) return;
    if (value === lastEmittedRef.current) {
      lastExternalRef.current = value;
      return;
    }
    lastExternalRef.current = value;
    setMarkdownCache(value);
    setSourceDraft(value);
    syncingRef.current = true;
    const md = value ?? '';
    const blocks = md.trim()
      ? editor.tryParseMarkdownToBlocks(md)
      : [{ type: 'paragraph' as const, content: '' }];
    // avoid error if document empty
    try {
      editor.replaceBlocks(editor.document, blocks);
    } catch {
      // fallback: remove all then insert
      try {
        (
          editor as unknown as {
            _tiptapEditor?: { commands?: { setContent?: (s: string) => void } };
          }
        )._tiptapEditor?.commands?.setContent?.('');
      } catch {}
    }
    queueMicrotask(() => {
      syncingRef.current = false;
    });
  }, [value, editor, open]);

  const handleEditorChange = React.useCallback(async () => {
    if (readOnly || syncingRef.current) return;
    const md = await editor.blocksToMarkdownLossy(editor.document);
    const normalized = md.trimEnd();
    if (normalized === lastEmittedRef.current) return;
    lastEmittedRef.current = normalized;
    lastExternalRef.current = normalized;
    setMarkdownCache(normalized);
    setSourceDraft(normalized);
    onChange?.(normalized);
  }, [editor, onChange, readOnly]);

  // source textarea -> editor
  const handleSourceChange = React.useCallback((next: string) => {
    setSourceDraft(next);
    // don't auto-sync to editor until blur or apply; but for split we may want live?
  }, []);

  const applySourceToEditor = React.useCallback(() => {
    const md = sourceDraft ?? '';
    syncingRef.current = true;
    const blocks = md.trim()
      ? editor.tryParseMarkdownToBlocks(md)
      : [{ type: 'paragraph' as const, content: '' }];
    try {
      editor.replaceBlocks(editor.document, blocks);
    } catch {}
    const normalized = md.trimEnd();
    lastEmittedRef.current = normalized;
    lastExternalRef.current = normalized;
    setMarkdownCache(normalized);
    onChange?.(normalized);
    queueMicrotask(() => {
      syncingRef.current = false;
    });
  }, [editor, sourceDraft, onChange]);

  // Esc to close, lock body scroll
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  const stats = React.useMemo(() => countWords(markdownCache), [markdownCache]);
  const blockCount = editor.document.length;

  const handleCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(markdownCache);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }, [markdownCache]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-white dark:bg-zinc-950 text-panel-text isolate">
      {/* header - 顶部完全不透明，纯色覆盖下层画布，保证阅读 */}
      <div className="flex shrink-0 flex-col border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm opacity-100 isolate">
        <div className="flex items-center gap-3 px-4 py-2 bg-white dark:bg-zinc-900 opacity-100">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="min-w-0">
              <div className="font-semibold leading-none truncate flex items-center gap-2">
                {title ?? '文档编辑'}{' '}
                {readOnly ? (
                  <Chip size="sm" variant="soft">
                    只读
                  </Chip>
                ) : (
                  <Chip size="sm" color="accent" variant="soft">
                    可编辑
                  </Chip>
                )}
              </div>
            </div>
            <div className="hidden md:flex items-center gap-1.5 ml-3">
              <Chip size="sm" variant="soft">
                {blockCount} 块
              </Chip>
              <Chip size="sm" variant="soft">
                {stats.words} 词
              </Chip>
              <Chip size="sm" variant="soft">
                {stats.chars} 字符
              </Chip>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <div className="hidden sm:flex items-center rounded-full border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 p-1 opacity-100">
              <button
                onClick={() => setViewMode('rich')}
                className={`inline-flex items-center justify-center h-8 rounded-full px-3 text-xs font-medium transition-colors ${viewMode === 'rich' ? 'bg-white shadow-sm border border-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100' : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'}`}
              >
                富文本
              </button>
              <button
                onClick={() => setViewMode('source')}
                className={`inline-flex items-center justify-center h-8 rounded-full px-3 text-xs font-medium transition-colors ${viewMode === 'source' ? 'bg-white shadow-sm border border-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100' : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'}`}
              >
                源码
              </button>
              <button
                onClick={() => setViewMode('split')}
                className={`inline-flex items-center justify-center h-8 rounded-full px-3 text-xs font-medium transition-colors ${viewMode === 'split' ? 'bg-white shadow-sm border border-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100' : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'}`}
              >
                分栏
              </button>
            </div>
            <Button size="sm" variant="tertiary" onPress={handleCopy} className="hidden sm:flex">
              {copied ? '已复制' : '复制 Markdown'}
            </Button>
            <Button size="sm" variant="tertiary" onPress={onClose} aria-label="关闭全屏">
              <span className="flex items-center gap-1.5">
                <CloseIcon /> 关闭
              </span>
            </Button>
          </div>
        </div>

        {viewMode === 'source' ? (
          <div className="flex items-center gap-2 border-t border-zinc-200 dark:border-zinc-800 bg-amber-50 dark:bg-zinc-800 px-3 py-2 text-xs text-amber-800 dark:text-amber-200 opacity-100">
            <span>源码模式：直接编辑 Markdown，保存后同步至富文本</span>
            <span className="ml-auto flex items-center gap-1.5">
              <Button
                size="sm"
                variant="primary"
                onPress={applySourceToEditor}
                isDisabled={readOnly}
              >
                应用到富文本
              </Button>
            </span>
          </div>
        ) : null}
      </div>

      {/* body */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* editor pane */}
        {(viewMode === 'rich' || viewMode === 'split') && (
          <div
            className={`flex flex-col min-w-0 ${viewMode === 'split' ? 'flex-1 border-r border-panel-line' : 'flex-1'}`}
          >
            <div className="flex-1 overflow-auto bg-white dark:bg-zinc-900">
              <div className="mx-auto max-w-[860px] px-6 py-8 sm:px-8">
                <div className="block-markdown-editor fullscreen">
                  <BlockNoteView
                    editor={editor as unknown as Parameters<typeof BlockNoteView>[0]['editor']}
                    editable={!readOnly}
                    onChange={handleEditorChange}
                    theme={effectiveTheme}
                  />
                </div>
                {!readOnly && placeholder ? (
                  <div className="mt-2 text-xs text-default-400">{placeholder}</div>
                ) : null}
              </div>
            </div>
            {/* status bar */}
            <div className="flex items-center gap-3 border-t border-panel-line bg-panel-surface px-4 py-2 text-xs text-default-500">
              <span>{blockCount} 块</span>
              <span>·</span>
              <span>{stats.lines} 行</span>
              <span>·</span>
              <span>{stats.chars} 字符</span>
              <span className="hidden sm:inline">· {stats.words} 词</span>
              <span className="ml-auto flex items-center gap-2">
                <Button size="sm" variant="tertiary" onPress={handleCopy}>
                  {copied ? '已复制 ✓' : '复制'}
                </Button>
                <Button size="sm" variant="primary" onPress={onClose}>
                  完成
                </Button>
              </span>
            </div>
          </div>
        )}

        {/* source pane */}
        {(viewMode === 'source' || viewMode === 'split') && (
          <div
            className={`flex flex-col min-w-0 bg-zinc-50 dark:bg-zinc-950 ${viewMode === 'split' ? 'flex-1' : 'flex-1'}`}
          >
            <div className="flex items-center justify-between border-b border-panel-line bg-white px-3 py-2 dark:bg-zinc-900">
              <span className="text-xs font-semibold">Markdown 源码</span>
              <span className="flex items-center gap-1.5">
                <Button size="sm" variant="tertiary" onPress={handleCopy}>
                  复制
                </Button>
                {viewMode === 'source' ? (
                  <Button
                    size="sm"
                    variant="primary"
                    onPress={applySourceToEditor}
                    isDisabled={readOnly}
                  >
                    应用
                  </Button>
                ) : null}
                {viewMode === 'split' ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onPress={applySourceToEditor}
                    isDisabled={readOnly}
                  >
                    同步到富文本 →
                  </Button>
                ) : null}
              </span>
            </div>
            <div className="flex-1 min-h-0 p-3">
              <textarea
                value={sourceDraft}
                onChange={(e) => handleSourceChange(e.target.value)}
                onBlur={() => {
                  // if split, optionally auto-sync on blur? keep manual to avoid churn
                }}
                readOnly={readOnly}
                placeholder={placeholder ?? '在此直接编辑 Markdown 源码…'}
                className="h-full w-full resize-none rounded-lg border border-panel-line bg-white p-4 font-mono text-sm leading-6 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 dark:bg-zinc-900 dark:text-zinc-100"
                spellCheck={false}
              />
            </div>
            <div className="border-t border-panel-line bg-white px-3 py-2 text-xs text-default-500 dark:bg-zinc-900 flex items-center gap-2">
              <span>行 {sourceDraft.split('\n').length}</span>
              <span>· 字符 {sourceDraft.length}</span>
              {readOnly ? (
                <span className="ml-auto">只读</span>
              ) : (
                <span className="ml-auto">Esc 关闭 · Ctrl+S 同步（自动）</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* mobile view mode switcher */}
      <div className="flex sm:hidden items-center justify-center gap-1 border-t border-panel-line bg-panel-surface p-2">
        <button
          onClick={() => setViewMode('rich')}
          className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium border ${viewMode === 'rich' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-panel-line'}`}
        >
          富文本
        </button>
        <button
          onClick={() => setViewMode('source')}
          className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium border ${viewMode === 'source' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-panel-line'}`}
        >
          源码
        </button>
        <button
          onClick={() => setViewMode('split')}
          className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium border ${viewMode === 'split' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-panel-line'}`}
        >
          分栏
        </button>
      </div>
    </div>
  );
}
