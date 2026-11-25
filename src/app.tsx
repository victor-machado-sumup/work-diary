import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

function App() {
  const [content, setContent] = useState('');
  const [open, setOpen] = useState(false);

  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <Textarea
        className="min-h-0 flex-1 resize-none"
        placeholder="Write something..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
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
