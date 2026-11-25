import { useLayoutEffect, useRef, type ComponentProps } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** Tags `data-line` (source line) on block elements so we can sync scrolling. */
function withLine<T extends keyof React.JSX.IntrinsicElements>(Tag: T) {
  return function Block({
    node,
    ...props
  }: ComponentProps<T> & {
    node?: { position?: { start: { line: number } } };
  }) {
    const Component = Tag as React.ElementType;
    return <Component data-line={node?.position?.start.line} {...props} />;
  };
}

const components: Components = {
  h1: withLine('h1'),
  h2: withLine('h2'),
  h3: withLine('h3'),
  h4: withLine('h4'),
  h5: withLine('h5'),
  h6: withLine('h6'),
  p: withLine('p'),
  li: withLine('li'),
  pre: withLine('pre'),
  blockquote: withLine('blockquote'),
  table: withLine('table'),
  hr: withLine('hr'),
  a: ({ node: _node, ...props }) => (
    <a {...props} target="_blank" rel="noreferrer" />
  ),
};

interface MarkdownPreviewProps {
  content: string;
  /** Editor's top visible line (1-based); the preview scrolls near it on mount. */
  topLine?: number;
  className?: string;
}

export function MarkdownPreview({
  content,
  topLine = 1,
  className,
}: MarkdownPreviewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll to the last block that starts at or before the editor's top line.
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    if (topLine <= 1) {
      scroller.scrollTop = 0;
      return;
    }
    let target: HTMLElement | null = null;
    for (const el of scroller.querySelectorAll<HTMLElement>('[data-line]')) {
      if (Number(el.dataset.line) > topLine) break;
      target = el;
    }
    if (target) {
      scroller.scrollTop =
        target.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top +
        scroller.scrollTop;
    }
    // Only on mount: the preview is remounted each time it is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={scrollRef} className={className}>
      <article className="prose prose-sm prose-invert max-w-none p-4">
        <Markdown remarkPlugins={[remarkGfm]} components={components}>
          {content}
        </Markdown>
      </article>
    </div>
  );
}
