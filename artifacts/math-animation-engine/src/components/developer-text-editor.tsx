import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getListStudioContentQueryKey,
  useListStudioContent,
  useUpdateStudioContent,
} from '@workspace/api-client-react';
import { DEVELOPER_EMAIL, DEVELOPER_PASSWORD } from '@/components/developer-access-form';

type TextEdit = {
  key: string;
  value: string;
  top: number;
  left: number;
};

type DeveloperTextEditorProps = {
  rootRef: RefObject<HTMLDivElement | null>;
};

function textNodeKey(node: Node, root: Node) {
  const segments: number[] = [];
  let current: Node | null = node;
  while (current && current !== root) {
    const parent: Node | null = current.parentNode;
    if (!parent) return '';
    segments.unshift(Array.prototype.indexOf.call(parent.childNodes, current));
    current = parent;
  }
  return current === root ? `text:${segments.join('.')}` : '';
}

function isEditorUi(node: Node | null) {
  const element = node instanceof Element
    ? node
    : node?.parentNode instanceof Element
      ? node.parentNode
      : null;
  return Boolean(element?.closest('[data-dev-editor-ui]'));
}

function findTextNodeAtPoint(root: HTMLElement, event: MouseEvent) {
  const documentWithCaret = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const position = documentWithCaret.caretPositionFromPoint?.(event.clientX, event.clientY);
  if (position?.offsetNode.nodeType === Node.TEXT_NODE && root.contains(position.offsetNode)) {
    return position.offsetNode;
  }
  const range = documentWithCaret.caretRangeFromPoint?.(event.clientX, event.clientY);
  if (range?.startContainer.nodeType === Node.TEXT_NODE && root.contains(range.startContainer)) {
    return range.startContainer;
  }

  const target = event.target instanceof Element ? event.target : null;
  if (!target || target.closest('canvas, iframe, input, textarea, select, option, svg, button, a, label, [data-dev-editor-ui]')) {
    return null;
  }
  const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (node.textContent?.trim()) return node;
    node = walker.nextNode();
  }
  return null;
}

function textRect(node: Node) {
  const range = document.createRange();
  range.selectNodeContents(node);
  const rect = range.getBoundingClientRect();
  return { top: rect.bottom + 8, left: Math.max(12, Math.min(window.innerWidth - 372, rect.left)) };
}

export function DeveloperTextEditor({ rootRef }: DeveloperTextEditorProps) {
  const isDeveloper = useMemo(() => {
    try {
      return window.localStorage.getItem('second-solution-developer') === 'true';
    } catch {
      return false;
    }
  }, []);
  const queryClient = useQueryClient();
  const contentQuery = useListStudioContent({
    query: {
      queryKey: getListStudioContentQueryKey(),
      refetchInterval: 10000,
      refetchOnMount: true,
      staleTime: 0,
    },
  });
  const updateContentMutation = useUpdateStudioContent();
  const [overrides, setOverrides] = useState<Map<string, string>>(new Map());
  const [editing, setEditing] = useState<TextEdit | null>(null);
  const [draft, setDraft] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState('');
  const overridesRef = useRef(overrides);
  overridesRef.current = overrides;

  const serverOverrides = useMemo(() => {
    const next = new Map<string, string>();
    for (const entry of contentQuery.data ?? []) {
      next.set(entry.key, entry.text);
    }
    return next;
  }, [contentQuery.data]);

  const applyOverrides = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      if (!isEditorUi(node)) {
        const key = textNodeKey(node, root);
        const override = overridesRef.current.get(key);
        if (override !== undefined && node.nodeValue !== override) {
          node.nodeValue = override;
        }
      }
      node = walker.nextNode();
    }
  }, [rootRef]);

  useEffect(() => {
    setOverrides(serverOverrides);
  }, [serverOverrides]);

  useEffect(() => {
    applyOverrides();
    const root = rootRef.current;
    if (!root) return;
    const observer = new MutationObserver(() => applyOverrides());
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [applyOverrides, rootRef, serverOverrides]);

  useEffect(() => {
    applyOverrides();
  }, [applyOverrides, overrides]);

  const beginEdit = useCallback((event: MouseEvent) => {
    if (!isDeveloper || confirming || editing) return;
    const root = rootRef.current;
    if (!root) return;
    const target = event.target instanceof Element ? event.target : null;
    if (
      !target
      || target.closest('canvas, iframe, input, textarea, select, option, svg, button, a, label, [data-dev-editor-ui]')
    ) {
      return;
    }
    const node = findTextNodeAtPoint(root, event);
    if (!node || !node.textContent?.trim()) return;
    const key = textNodeKey(node, root);
    if (!key) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = textRect(node);
    setEditing({ key, value: node.nodeValue ?? '', ...rect });
    setDraft(node.nodeValue ?? '');
    setStatus('');
  }, [confirming, editing, isDeveloper, rootRef]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.addEventListener('click', beginEdit, true);
    return () => root.removeEventListener('click', beginEdit, true);
  }, [beginEdit, rootRef]);

  const requestConfirmation = () => {
    if (!editing || !draft.trim()) return;
    setConfirming(true);
  };

  const saveEdit = async () => {
    if (!editing || !draft.trim()) return;
    setStatus('Saving shared copy…');
    try {
      const saved = await updateContentMutation.mutateAsync({
        data: {
          key: editing.key,
          text: draft,
          developerEmail: DEVELOPER_EMAIL,
          developerPassword: DEVELOPER_PASSWORD,
        },
      });
      setOverrides((current) => new Map(current).set(saved.key, saved.text));
      await queryClient.invalidateQueries({ queryKey: getListStudioContentQueryKey() });
      setConfirming(false);
      setEditing(null);
      setStatus('Saved for every Studio visitor.');
    } catch {
      setConfirming(false);
      setStatus('Could not save this change. Please try again.');
    }
  };

  const cancelEdit = () => {
    setConfirming(false);
    setEditing(null);
    setDraft('');
  };

  return (
    <>
      <div
        data-dev-editor-ui
        className={isDeveloper ? 'developer-edit-mode' : 'developer-edit-mode is-hidden'}
        aria-hidden={!isDeveloper}
      >
        {isDeveloper && <span className="developer-mode-badge">DEVELOPER MODE · click copy to edit</span>}
      </div>
      {editing && (
        <div
          data-dev-editor-ui
          className="developer-inline-editor"
          style={{ top: editing.top, left: editing.left }}
          role="dialog"
          aria-label="Edit Studio text"
        >
          <input
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                requestConfirmation();
              }
              if (event.key === 'Escape') cancelEdit();
            }}
            aria-label="Text to save"
          />
          <div className="developer-inline-actions">
            <button type="button" onClick={requestConfirmation}>OK</button>
            <button type="button" onClick={cancelEdit}>Cancel</button>
          </div>
        </div>
      )}
      {confirming && (
        <div data-dev-editor-ui className="developer-confirm-backdrop" role="presentation">
          <div className="developer-confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="developer-confirm-title">
            <span className="landing-eyebrow">Confirm shared change</span>
            <h2 id="developer-confirm-title">Are you sure you want to change it?</h2>
            <p>This text will be updated for every user across reloads.</p>
            <div className="developer-confirm-actions">
              <button type="button" onClick={saveEdit} disabled={updateContentMutation.isPending}>Yes</button>
              <button type="button" onClick={() => setConfirming(false)} disabled={updateContentMutation.isPending}>No</button>
            </div>
          </div>
        </div>
      )}
      {status && <div data-dev-editor-ui className="developer-save-status" role="status">{status}</div>}
    </>
  );
}