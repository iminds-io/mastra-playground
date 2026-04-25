// @vitest-environment jsdom
// ABOUTME: Tests for the minimal markdown renderer
// ABOUTME: Covers paragraphs, emphasis, code, lists, links, blockquotes, and copy support

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MarkdownBody } from './MarkdownBody';

describe('MarkdownBody', () => {
  afterEach(cleanup);

  it('renders plain text as a paragraph', () => {
    render(<MarkdownBody text="Hello world" />);
    expect(screen.getByText('Hello world')).toBeTruthy();
  });

  it('renders multiple paragraphs from double newlines', () => {
    const { container } = render(<MarkdownBody text={'First paragraph\n\nSecond paragraph'} />);
    expect(container.querySelectorAll('p').length).toBeGreaterThanOrEqual(2);
  });

  it('renders **bold** text', () => {
    const { container } = render(<MarkdownBody text="This is **bold** text" />);
    const strong = container.querySelector('strong');
    expect(strong?.textContent).toBe('bold');
  });

  it('renders *italic* text', () => {
    const { container } = render(<MarkdownBody text="This is *italic* text" />);
    const em = container.querySelector('em');
    expect(em?.textContent).toBe('italic');
  });

  it('renders `inline code`', () => {
    const { container } = render(<MarkdownBody text="Use `const x = 1` here" />);
    expect(container.querySelector('code')?.textContent).toBe('const x = 1');
  });

  it('renders fenced code blocks with a copy button', () => {
    const { container } = render(<MarkdownBody text={'```js\nconsole.log("hi")\n```'} />);
    expect(container.querySelector('pre')?.textContent).toContain('console.log("hi")');
    expect(container.querySelector('.code-block-copy')).toBeTruthy();
  });

  it('renders unordered lists from lines starting with -', () => {
    const { container } = render(<MarkdownBody text={'- Item one\n- Item two\n- Item three'} />);
    expect(container.querySelectorAll('ul li').length).toBe(3);
  });

  it('renders ordered lists from numbered lines', () => {
    const { container } = render(<MarkdownBody text={'1. First\n2. Second\n3. Third'} />);
    expect(container.querySelectorAll('ol li').length).toBe(3);
  });

  it('renders [links](url) as anchor tags', () => {
    render(<MarkdownBody text="Visit [Google](https://google.com) today" />);
    expect(screen.getByRole('link', { name: 'Google' }).getAttribute('href')).toBe('https://google.com');
  });

  it('renders blockquotes from lines starting with >', () => {
    const { container } = render(<MarkdownBody text="> This is a quote" />);
    expect(container.querySelector('blockquote')?.textContent).toContain('This is a quote');
  });

  it('copies code block content to clipboard on copy button click', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    const { container } = render(<MarkdownBody text={'```\nhello world\n```'} />);
    fireEvent.click(container.querySelector('.code-block-copy') as HTMLButtonElement);

    expect(writeText).toHaveBeenCalledWith('hello world');
  });

  it('renders empty string without crashing', () => {
    const { container } = render(<MarkdownBody text="" />);
    expect(container).toBeTruthy();
  });
});
