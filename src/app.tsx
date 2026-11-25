import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MonacoEditor } from '@/components/monaco-editor';

function App() {
  const [content, setContent] = useState('');
  const [open, setOpen] = useState(false);

  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <MonacoEditor
        className="min-h-0 flex-1 overflow-hidden rounded-md border"
        value={content}
        onChange={setContent}
      />
      <div className="flex justify-end">
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
