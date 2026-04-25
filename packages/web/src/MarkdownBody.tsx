// ABOUTME: Minimal markdown-to-React renderer for predictable AI message content
// ABOUTME: Handles paragraphs, emphasis, inline/fenced code, lists, links, and blockquotes

import { useState, type ReactNode } from 'react';

type MarkdownBodyProps = {
  text: string;
};

function parseInline(line: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`(.+?)`)|(\[(.+?)\]\((.+?)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(line)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(line.slice(lastIndex, match.index));
    }

    if (match[2]) {
      nodes.push(<strong key={key += 1}>{match[2]}</strong>);
    } else if (match[4]) {
      nodes.push(<em key={key += 1}>{match[4]}</em>);
    } else if (match[6]) {
      nodes.push(<code key={key += 1}>{match[6]}</code>);
    } else if (match[8] && match[9]) {
      nodes.push(
        <a key={key += 1} href={match[9]} target="_blank" rel="noopener noreferrer">
          {match[8]}
        </a>,
      );
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < line.length) {
    nodes.push(line.slice(lastIndex));
  }

  return nodes;
}

function CodeBlock({ code, language }: { code: string; language?: string | undefined }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="code-block-wrapper">
      <button className="code-block-copy" onClick={handleCopy} aria-label="Copy code" type="button">
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre>
        <code data-language={language || undefined}>{code}</code>
      </pre>
    </div>
  );
}

export function MarkdownBody({ text }: MarkdownBodyProps) {
  if (!text) {
    return null;
  }

  const lines = text.split('\n');
  const elements: ReactNode[] = [];
  let key = 0;
  let index = 0;

  while (index < lines.length) {
    const line = lines[index]!;

    if (line.startsWith('```')) {
      const language = line.slice(3).trim() || undefined;
      const codeLines: string[] = [];
      index += 1;

      while (index < lines.length && !lines[index]!.startsWith('```')) {
        codeLines.push(lines[index]!);
        index += 1;
      }

      index += 1;
      elements.push(<CodeBlock key={key += 1} code={codeLines.join('\n')} language={language} />);
      continue;
    }

    if (line.startsWith('> ')) {
      const quoteLines: string[] = [];
      while (index < lines.length && lines[index]!.startsWith('> ')) {
        quoteLines.push(lines[index]!.slice(2));
        index += 1;
      }

      elements.push(
        <blockquote key={key += 1}>
          {quoteLines.map((quoteLine, quoteIndex) => (
            <p key={quoteIndex}>{parseInline(quoteLine)}</p>
          ))}
        </blockquote>,
      );
      continue;
    }

    if (line.startsWith('- ')) {
      const items: string[] = [];
      while (index < lines.length && lines[index]!.startsWith('- ')) {
        items.push(lines[index]!.slice(2));
        index += 1;
      }

      elements.push(
        <ul key={key += 1}>
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{parseInline(item)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s/.test(lines[index]!)) {
        items.push(lines[index]!.replace(/^\d+\.\s/, ''));
        index += 1;
      }

      elements.push(
        <ol key={key += 1}>
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{parseInline(item)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    if (line.trim() === '') {
      index += 1;
      continue;
    }

    elements.push(<p key={key += 1}>{parseInline(line)}</p>);
    index += 1;
  }

  return <div className="markdown-body">{elements}</div>;
}
