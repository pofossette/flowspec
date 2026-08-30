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
  const { value, onChange, readOnly = false, placeholder: _placeholder, theme } = props;
  // we keep editor instance stable per mount; value sync via replaceBlocks
  const editor = useCreateBlockNote({}); // lib type gap: default schema initialContent optional

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

  return (
    <div className="block-markdown-editor">
      <BlockNoteView
        editor={editor as unknown as Parameters<typeof BlockNoteView>[0]['editor']} // lib type gap: blocknote generic schema mismatch
        editable={!readOnly}
        onChange={handleChange}
        theme={theme ?? (document.documentElement.classList.contains('dark') ? 'dark' : 'light')}
      />
    </div>
  );
}
