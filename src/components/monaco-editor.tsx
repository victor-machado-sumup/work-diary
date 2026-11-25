import {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type Ref,
} from 'react';
import * as monaco from 'monaco-editor';

// Markdown has no dedicated language worker, so only the base editor worker is needed.
self.MonacoEnvironment = {
  getWorker: () =>
    new Worker(
      new URL('monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url),
    ),
};

export interface MonacoEditorHandle {
  /** First line currently visible at the top of the viewport (1-based). */
  getTopLine: () => number;
  /** Replaces the whole text. */
  setValue: (value: string) => void;
}

interface MonacoEditorProps {
  /** Initial content only. Later changes are ignored (the editor owns its text). */
  defaultValue?: string;
  onChange: (value: string) => void;
  language?: string;
  className?: string;
  /** Hides the editor (keeping it mounted) and restores scroll/cursor on show. */
  hidden?: boolean;
  handleRef?: Ref<MonacoEditorHandle>;
  /** Blocks typing. */
  disabled?: boolean;
}

export function MonacoEditor({
  defaultValue = '',
  onChange,
  language = 'markdown',
  className,
  hidden = false,
  handleRef,
  disabled = false,
}: MonacoEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const viewStateRef = useRef<monaco.editor.ICodeEditorViewState | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useImperativeHandle(handleRef, () => ({
    getTopLine: () =>
      editorRef.current?.getVisibleRanges()[0]?.startLineNumber ?? 1,
    setValue: (value) => editorRef.current?.setValue(value),
  }));

  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  useEffect(() => {
    editorRef.current?.updateOptions({ readOnly: disabled });
  }, [disabled]);

  // Save view state (scroll, cursor, selection) before hiding; restore on show.
  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (hidden) {
      viewStateRef.current = editor.saveViewState();
      return;
    }
    editor.layout();
    if (viewStateRef.current) editor.restoreViewState(viewStateRef.current);
    editor.focus();
  }, [hidden]);

  useEffect(() => {
    const editor = monaco.editor.create(containerRef.current!, {
      value: defaultValue,
      readOnly: disabledRef.current,
      language,
      theme: 'vs-dark',
      quickSuggestions: false,
      suggestOnTriggerCharacters: false,
      wordBasedSuggestions: 'off',
      acceptSuggestionOnEnter: 'off',
      tabCompletion: 'off',
      parameterHints: { enabled: false },
      automaticLayout: true,
      wordWrap: 'on',
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      // Built-in drop inserts text as a snippet and leaves a literal "$0".
      dropIntoEditor: { enabled: false },
    });
    editorRef.current = editor;

    const subscription = editor.onDidChangeModelContent(() => {
      onChangeRef.current(editor.getValue());
    });

    return () => {
      subscription.dispose();
      editor.getModel()?.dispose();
      editor.dispose();
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  return (
    <div
      ref={containerRef}
      className={
        (hidden ? `${className ?? ''} hidden` : className) +
        (disabled ? ' opacity-60' : '')
      }
    />
  );
}
