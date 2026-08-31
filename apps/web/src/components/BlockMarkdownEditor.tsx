import { BlockNoteView } from '@blocknote/mantine';
import { useCreateBlockNote } from '@blocknote/react';
import * as React from 'react';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';

type Props = {
  value: string;
  onChange?: ((markdown: string) => void) | undefined;
  readOnly?: boolean;
  placeholder?: string;
  theme?: 'light' | 'dark';
};

export function BlockMarkdownEditor(props: Props): React.JSX.Element {
  const { value, onChange, readOnly = false, placeholder, theme } = props;
  // we keep editor instance stable per mount; value sync via replaceBlocks
  // 完备 markdown：支持全部默认块（标题、列表、引用、代码、表格、图片/音视频/文件、分割线、折叠等），
  // 内联：粗体/斜体/下划线/删除线/行内代码/链接/颜色/对齐， plus 斜杠菜单、格式化工具栏、侧边菜单、表格句柄、文件面板
  const editor = useCreateBlockNote({
    uploadFile: async (file: File) => URL.createObjectURL(file),
  }); // lib type gap: default schema initialContent optional

  const lastExternalRef = React.useRef<string>(value);
  const lastEmittedRef = React.useRef<string>(value);
  const syncingRef = React.useRef(false);

  // external value -> editor blocks (when selection changes or parent updates)
  React.useEffect(() => {
    if (value === lastEmittedRef.current && value === lastExternalRef.current) return;
    // avoid echo: if we just emitted this value, skip parse
    if (value === lastEmittedRef.current) {
      lastExternalRef.current = value;
      return;
    }
    lastExternalRef.current = value;
    syncingRef.current = true;
    const md = value ?? '';
    // empty => single empty paragraph
    const blocks = md.trim()
      ? editor.tryParseMarkdownToBlocks(md)
      : [{ type: 'paragraph' as const, content: '' }];
    // replace without triggering onChange loop
    editor.replaceBlocks(editor.document, blocks);
    // ensure cursor at start for empty
    queueMicrotask(() => {
      syncingRef.current = false;
    });
  }, [value, editor]);

  const handleChange = React.useCallback(async () => {
    if (readOnly || syncingRef.current) return;
    const md = await editor.blocksToMarkdownLossy(editor.document);
    // normalize: blocknote adds trailing newline
    const normalized = md.trimEnd();
    if (normalized === lastEmittedRef.current) return;
    lastEmittedRef.current = normalized;
    lastExternalRef.current = normalized;
    onChange?.(normalized);
  }, [editor, onChange, readOnly]);

  // placeholder hint: BlockNote shows placeholder via empty block, we expose via data attribute for CSS
  return (
    <div className="block-markdown-editor" data-placeholder={placeholder ?? ''}>
      <BlockNoteView
        editor={editor as unknown as Parameters<typeof BlockNoteView>[0]['editor']} // lib type gap: blocknote generic schema mismatch
        editable={!readOnly}
        onChange={handleChange}
        theme={theme ?? (document.documentElement.classList.contains('dark') ? 'dark' : 'light')}
      />
    </div>
  );
}
