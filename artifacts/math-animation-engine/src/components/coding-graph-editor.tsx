import { useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import type { CodingGraphDiagnostic, CodingGraphLanguage } from '@/lib/coding-graph-compiler';

export type CodingGraphMode = 'code2d' | 'code3d';
export type CodingCompileStatus = 'ready' | 'pending' | 'error';
type CodingGraphEditorProps = {
  value: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
  mode: CodingGraphMode;
  status: CodingCompileStatus;
  statusLabel?: string;
  diagnostic?: CodingGraphDiagnostic;
  language?: CodingGraphLanguage;
  onLanguageChange?: (language: CodingGraphLanguage) => void;
  testId?: string;
};

const modeCopy: Record<CodingGraphMode, {
  language: string;
  subtitle: string;
  accent: string;
  example: string;
}> = {
  code2d: {
    language: 'JavaScript',
    subtitle: 'draw a 2D graph frame by frame',
    accent: 'signal-lime',
    example: 'function graph({ x, t }) {\n  return Math.sin(x + t) * 0.8;\n}',
  },
  code3d: {
    language: 'JavaScript',
    subtitle: 'define a 3D field for the scene',
    accent: 'signal-cyan',
    example: 'function field({ x, y, z, t }) {\n  return x * x + y * y + z * z - 4;\n}',
  },
};

const languageOptions: Array<{ value: CodingGraphLanguage; label: string; extension: string }> = [
  { value: 'javascript', label: 'JavaScript', extension: 'js' },
  { value: 'python', label: 'Python', extension: 'py' },
  { value: 'glsl', label: 'GLSL', extension: 'glsl' },
];

export function CodingGraphEditor({
  value,
  onChange,
  onFocus,
  mode,
  status,
  statusLabel,
  diagnostic,
  language = 'javascript',
  onLanguageChange,
  testId,
}: CodingGraphEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const details = modeCopy[mode];
  const selectedLanguage = languageOptions.find((option) => option.value === language) ?? languageOptions[0];
  const lineCount = useMemo(() => Math.max(1, value.split('\n').length), [value]);
  const lines = useMemo(
    () => Array.from({ length: lineCount }, (_, index) => String(index + 1).padStart(2, '0')),
    [lineCount],
  );

  const insertIndent = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Tab') return;
    event.preventDefault();
    const textarea = event.currentTarget;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const nextValue = `${value.slice(0, start)}  ${value.slice(end)}`;
    onChange(nextValue);
    window.requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + 2, start + 2);
    });
  };

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    onChange(event.target.value);
  };

  const statusText = statusLabel ?? (
    status === 'pending' ? 'Compiling' : status === 'error' ? 'Needs review' : 'Compile ready'
  );
  const highlightedLines = value.split('\n');
  const renderLine = (line: string, lineIndex: number) => {
    if (!diagnostic || diagnostic.line !== lineIndex + 1) return <>{line || ' '}</>;
    const start = Math.max(0, Math.min(line.length, diagnostic.column - 1));
    const end = Math.max(start + 1, Math.min(line.length, start + diagnostic.length));
    return (
      <>
        {line.slice(0, start)}
        <mark className="coding-error-underline">{line.slice(start, end) || ' '}</mark>
        {line.slice(end)}
      </>
    );
  };

  return (
    <div className={`coding-editor coding-editor-${mode} coding-editor-${status}`} data-testid={`editor-${testId ?? mode}`}>
      <div className="coding-editor-chrome">
        <div className="coding-editor-title">
          <span className={`coding-language-mark ${details.accent}`} aria-hidden="true">
            {mode === 'code2d' ? '2D' : '3D'}
          </span>
          <div>
            <strong>{mode === 'code2d' ? 'Coding 2D Graph' : 'Coding 3D Graph'}</strong>
            <span>{details.subtitle}</span>
          </div>
        </div>
        <div className={`coding-compile-badge ${status}`} data-testid="status-code-compile" role="status">
          <span className="coding-status-dot" />
          <span>{statusText}</span>
        </div>
      </div>
      <div className="coding-editor-meta">
        <span className="coding-file-badge">graph.{selectedLanguage.extension}</span>
        <span className="coding-runtime-badge">{selectedLanguage.label}</span>
        <label className="coding-language-control" htmlFor={`coding-language-${testId ?? mode}`}>
          <span className="coding-language-label">Language</span>
          <select
            id={`coding-language-${testId ?? mode}`}
            className="coding-language-select"
            value={language}
            onChange={(event) => onLanguageChange?.(event.target.value as CodingGraphLanguage)}
            aria-label={`${mode === 'code2d' ? 'Coding 2D Graph' : 'Coding 3D Graph'} language`}
          >
            {languageOptions.map((option) => (
              <option value={option.value} key={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <span className="coding-meta-spacer" />
        <span className="coding-meta-hint">Tab inserts spaces</span>
      </div>
      <div className="coding-editor-body">
        <div className="coding-gutter" aria-hidden="true" style={{ transform: `translateY(-${scrollTop}px)` }}>
          {lines.map((line, index) => <span className={diagnostic?.line === index + 1 ? 'has-error' : ''} key={line}>{line}</span>)}
        </div>
        <div className="coding-source-surface">
          <pre
            className="coding-source-highlight"
            aria-hidden="true"
            style={{ transform: `translate(${-scrollLeft}px, ${-scrollTop}px)` }}
          >
            {highlightedLines.map((line, index) => <span className="coding-source-highlight-line" key={`${index}-${line}`}>{renderLine(line, index)}{index < highlightedLines.length - 1 ? '\n' : ''}</span>)}
          </pre>
          <textarea
            ref={textareaRef}
            className="coding-source-input"
            value={value}
            onFocus={onFocus}
            onChange={handleChange}
            onKeyDown={insertIndent}
            onScroll={(event) => {
              setScrollTop(event.currentTarget.scrollTop);
              setScrollLeft(event.currentTarget.scrollLeft);
            }}
            placeholder={details.example}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            rows={7}
            data-testid={testId ?? `input-${mode}`}
            aria-label={`${mode === 'code2d' ? 'Coding 2D Graph' : 'Coding 3D Graph'} source`}
            aria-describedby={diagnostic ? `coding-error-${testId ?? mode}` : undefined}
          />
        </div>
      </div>
      {diagnostic && (
        <div className="coding-error-detail" id={`coding-error-${testId ?? mode}`} role="alert">
          <strong>Line {diagnostic.line}, column {diagnostic.column}:</strong> {diagnostic.message}
        </div>
      )}
      <div className="coding-editor-footer">
        <span className="coding-footer-symbol">fn</span>
        <span>Source adapter</span>
        <span className="coding-footer-separator">/</span>
        <span>{mode === 'code2d' ? 'Canvas 2D' : 'GPU field'}</span>
        <span className="coding-meta-spacer" />
        <span className="coding-line-count">{lineCount} {lineCount === 1 ? 'line' : 'lines'}</span>
      </div>
    </div>
  );
}