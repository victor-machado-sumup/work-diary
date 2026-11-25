import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  MonacoEditor,
  type MonacoEditorHandle,
} from '@/components/monaco-editor';
import { MarkdownPreview } from '@/components/markdown-preview';
import { ActivitySidebar } from '@/components/activity-sidebar';

function App() {
  const [content, setContent] = useState('');
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  const [topLine, setTopLine] = useState(1);
  const editorHandle = useRef<MonacoEditorHandle>(null);

  const togglePreview = () => {
    // Read the viewport while the editor is still visible.
    if (!preview) setTopLine(editorHandle.current?.getTopLine() ?? 1);
    setPreview(!preview);
  };

  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <div className="flex min-h-0 flex-1 gap-2">
        <MonacoEditor
          className="min-h-0 flex-1 overflow-hidden rounded-md border"
          onChange={setContent}
          hidden={preview}
          handleRef={editorHandle}
        />
        {preview && (
          <MarkdownPreview
            className="min-h-0 flex-1 overflow-y-auto rounded-md border"
            content={content}
            topLine={topLine}
          />
        )}
        <ActivitySidebar className="w-72 shrink-0 overflow-y-auto" />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={togglePreview}>
          {preview ? 'Edit' : 'Preview'}
        </Button>
        <Button onClick={() => setOpen(true)}>Save</Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Content</DialogTitle>
          </DialogHeader>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap text-sm">
            {content || '(empty)'}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
