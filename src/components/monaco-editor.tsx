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
      new URL(
        'monaco-editor/esm/vs/editor/editor.worker.js',
        import.meta.url,
      ),
    ),
};

export interface MonacoEditorHandle {
  /** First line currently visible at the top of the viewport (1-based). */
  getTopLine: () => number;
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
}

export function MonacoEditor({
  defaultValue = '',
  onChange,
  language = 'markdown',
  className,
  hidden = false,
  handleRef,
}: MonacoEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const viewStateRef = useRef<monaco.editor.ICodeEditorViewState | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useImperativeHandle(handleRef, () => ({
    getTopLine: () =>
      editorRef.current?.getVisibleRanges()[0]?.startLineNumber ?? 1,
  }));

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

    const container = containerRef.current!;
    // Dotted drop indicator, reusing Monaco's own "dnd-target" style.
    const dropIndicator = editor.createDecorationsCollection();
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      const position = editor.getTargetAtClientPoint(
        e.clientX,
        e.clientY,
      )?.position;
      if (position) {
        dropIndicator.set([
          {
            range: new monaco.Range(
              position.lineNumber,
              position.column,
              position.lineNumber,
              position.column,
            ),
            options: { className: 'dnd-target' },
          },
        ]);
      }
    };
    const onDragLeave = (e: DragEvent) => {
      // dragleave also fires when moving between child elements; only clear
      // when the pointer actually leaves the editor.
      if (!container.contains(e.relatedTarget as Node | null)) {
        dropIndicator.clear();
      }
    };
    const onDrop = (e: DragEvent) => {
      dropIndicator.clear();
      const text = e.dataTransfer?.getData('text/plain');
      if (!text) return;
      e.preventDefault();
      const position =
        editor.getTargetAtClientPoint(e.clientX, e.clientY)?.position ??
        editor.getPosition();
      if (!position) return;
      editor.executeEdits(
        'drop',
        [
          {
            range: new monaco.Range(
              position.lineNumber,
              position.column,
              position.lineNumber,
              position.column,
            ),
            text,
            forceMoveMarkers: true,
          },
        ],
        // The inverse edit's range covers the inserted text; put the cursor at its end.
        (inverseEdits) => {
          const { endLineNumber, endColumn } = inverseEdits[0].range;
          return [
            new monaco.Selection(
              endLineNumber,
              endColumn,
              endLineNumber,
              endColumn,
            ),
          ];
        },
      );
      editor.focus();
    };
    container.addEventListener('dragover', onDragOver);
    container.addEventListener('dragleave', onDragLeave);
    container.addEventListener('drop', onDrop);

    const subscription = editor.onDidChangeModelContent(() => {
      onChangeRef.current(editor.getValue());
    });

    return () => {
      container.removeEventListener('dragover', onDragOver);
      container.removeEventListener('dragleave', onDragLeave);
      container.removeEventListener('drop', onDrop);
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
      className={hidden ? `${className ?? ''} hidden` : className}
    />
  );
}
