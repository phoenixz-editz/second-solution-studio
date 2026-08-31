import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  Bug,
  CheckCircle2,
  ChevronRight,
  CircleUserRound,
  CreditCard,
  Database,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  LogIn,
  MessageCircle,
  Paintbrush,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { CSSProperties, FormEvent } from 'react';

export type AssistantPanel = 'overview' | 'diagnostics' | 'chat' | 'payment' | 'theme' | 'auth';

export type AssistantQuickAction =
  | 'bug-check'
  | 'payment-setup'
  | 'chat'
  | 'customization'
  | 'database-sync'
  | 'authenticated-login';

export type DiagnosticStatus = 'ok' | 'warning' | 'error' | 'running';

export type DiagnosticItem = {
  id: string;
  label: string;
  detail?: string;
  status: DiagnosticStatus;
  timestamp?: string;
};

export type AssistantChatMessage = {
  id: string;
  role: 'assistant' | 'user';
  content: string;
  timestamp?: string;
};

export type AssistantThemeOption = {
  id: string;
  label: string;
  description: string;
  swatch: string;
  accent?: string;
};

export type AssistantAuthMode = 'sign-in' | 'sign-up';

export type DeveloperAiAssistantProps = {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onPanelChange: (panel: AssistantPanel) => void;
  onQuickAction: (action: AssistantQuickAction) => void;
  activePanel?: AssistantPanel;
  isAuthenticated?: boolean;
  accountLabel?: string;
  diagnostics?: DiagnosticItem[];
  diagnosticsLoading?: boolean;
  diagnosticsError?: string;
  onRefreshDiagnostics?: () => void;
  messages?: AssistantChatMessage[];
  chatDraft?: string;
  onChatDraftChange?: (value: string) => void;
  onSendMessage?: (value: string) => void;
  paymentStatus?: 'idle' | 'connecting' | 'ready' | 'error';
  paymentMessage?: string;
  onPaymentSetup?: () => void;
  themeOptions?: AssistantThemeOption[];
  selectedTheme?: string;
  onThemeChange?: (themeId: string) => void;
  authMode?: AssistantAuthMode;
  onAuthModeChange?: (mode: AssistantAuthMode) => void;
  authEmail?: string;
  authPassword?: string;
  onAuthEmailChange?: (value: string) => void;
  onAuthPasswordChange?: (value: string) => void;
  onAuthenticate?: (mode: AssistantAuthMode) => void;
  authBusy?: boolean;
  authError?: string;
  className?: string;
};

type QuickActionDefinition = {
  id: AssistantQuickAction;
  label: string;
  detail: string;
  icon: LucideIcon;
  panel?: AssistantPanel;
  tone: 'lime' | 'coral' | 'cyan' | 'violet' | 'amber';
};

const quickActions: QuickActionDefinition[] = [
  { id: 'bug-check', label: 'Bug check', detail: 'Scan the current scene', icon: Bug, panel: 'diagnostics', tone: 'coral' },
  { id: 'payment-setup', label: 'Payment setup', detail: 'Connect a billing account', icon: CreditCard, panel: 'payment', tone: 'lime' },
  { id: 'chat', label: 'Chat with AI', detail: 'Ask about this workspace', icon: MessageCircle, panel: 'chat', tone: 'cyan' },
  { id: 'customization', label: 'Customization', detail: 'Tune the studio surface', icon: Paintbrush, panel: 'theme', tone: 'violet' },
  { id: 'database-sync', label: 'Database sync', detail: 'Check saved project state', icon: Database, tone: 'amber' },
  { id: 'authenticated-login', label: 'Authenticated login', detail: 'Use a protected session', icon: LogIn, panel: 'auth', tone: 'cyan' },
];

const defaultThemes: AssistantThemeOption[] = [
  { id: 'studio', label: 'Studio', description: 'Warm canvas, lime signal', swatch: '#f2eadb', accent: '#c7f36b' },
  { id: 'midnight', label: 'Midnight', description: 'Low light, high contrast', swatch: '#202635', accent: '#72d8ff' },
  { id: 'paper', label: 'Paper', description: 'Quiet surface, coral ink', swatch: '#f5f0e7', accent: '#ff8b6d' },
];

const assistantStyles = `
  .developer-ai-assistant {
    --assistant-ink: #202633;
    --assistant-muted: #6d7280;
    --assistant-line: rgba(32, 38, 51, .13);
    --assistant-paper: #fbf8f1;
    --assistant-paper-deep: #f1ebdf;
    --assistant-lime: #c7f36b;
    --assistant-coral: #ff8b6d;
    --assistant-cyan: #72d8ff;
    --assistant-violet: #d6a8ff;
    --assistant-amber: #ffd166;
    position: fixed;
    right: 22px;
    bottom: 22px;
    z-index: 40;
    color: var(--assistant-ink);
    font-family: var(--app-font-sans, "Space Grotesk", sans-serif);
  }
  .developer-ai-assistant *, .developer-ai-assistant *::before, .developer-ai-assistant *::after {
    box-sizing: border-box;
  }
  .developer-ai-launcher {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    min-height: 44px;
    padding: 0 14px 0 10px;
    border: 1px solid rgba(32, 38, 51, .84);
    border-radius: 13px 13px 5px 13px;
    background: var(--assistant-paper);
    color: var(--assistant-ink);
    box-shadow: 4px 4px 0 var(--assistant-ink), 0 14px 34px rgba(32, 38, 51, .14);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: -.01em;
    transition: transform .2s ease, box-shadow .2s ease;
  }
  .developer-ai-launcher:hover {
    transform: translateY(-2px);
    box-shadow: 4px 6px 0 var(--assistant-ink), 0 17px 36px rgba(32, 38, 51, .16);
  }
  .developer-ai-launcher-mark {
    display: grid;
    place-items: center;
    width: 25px;
    height: 25px;
    border: 1px solid var(--assistant-ink);
    border-radius: 8px 8px 8px 2px;
    background: var(--assistant-lime);
  }
  .developer-ai-launcher-mark svg { width: 14px; height: 14px; stroke-width: 2.2; }
  .developer-ai-launcher-pulse {
    width: 6px;
    height: 6px;
    margin-left: -5px;
    border: 1px solid var(--assistant-paper);
    border-radius: 50%;
    background: #5f9d32;
    box-shadow: 0 0 0 3px rgba(95, 157, 50, .16);
  }
  .developer-ai-drawer {
    display: flex;
    flex-direction: column;
    width: min(390px, calc(100vw - 28px));
    height: min(650px, calc(100dvh - 40px));
    overflow: hidden;
    border: 1px solid rgba(32, 38, 51, .18);
    border-radius: 18px 18px 7px 18px;
    background: var(--assistant-paper);
    box-shadow: 0 24px 70px rgba(32, 38, 51, .2), 5px 5px 0 rgba(32, 38, 51, .88);
    animation: developer-ai-drawer-in .24s cubic-bezier(.2,.8,.2,1) both;
  }
  @keyframes developer-ai-drawer-in {
    from { opacity: 0; transform: translateY(12px) scale(.98); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  .developer-ai-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 16px 16px 13px;
    border-bottom: 1px solid var(--assistant-line);
    background: linear-gradient(110deg, rgba(199, 243, 107, .18), rgba(251, 248, 241, .76) 54%);
  }
  .developer-ai-heading {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .developer-ai-avatar {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    flex: 0 0 auto;
    border: 1px solid var(--assistant-ink);
    border-radius: 11px 11px 11px 3px;
    background: var(--assistant-lime);
    box-shadow: 2px 2px 0 var(--assistant-ink);
  }
  .developer-ai-avatar svg { width: 17px; height: 17px; stroke-width: 1.9; }
  .developer-ai-title {
    margin: 0;
    color: var(--assistant-ink);
    font-size: 14px;
    font-weight: 700;
    letter-spacing: -.035em;
  }
  .developer-ai-subtitle {
    display: block;
    margin-top: 3px;
    overflow: hidden;
    color: var(--assistant-muted);
    font: 9px/1.35 var(--app-font-mono, "DM Mono", monospace);
    letter-spacing: .07em;
    text-overflow: ellipsis;
    text-transform: uppercase;
    white-space: nowrap;
  }
  .developer-ai-header-actions { display: flex; gap: 5px; }
  .developer-ai-icon-button {
    display: inline-grid;
    place-items: center;
    width: 29px;
    height: 29px;
    padding: 0;
    border: 1px solid var(--assistant-line);
    border-radius: 8px;
    background: rgba(255, 255, 255, .32);
    color: var(--assistant-muted);
    transition: background .18s ease, border-color .18s ease, color .18s ease, transform .18s ease;
  }
  .developer-ai-icon-button:hover {
    transform: translateY(-1px);
    border-color: rgba(32, 38, 51, .4);
    background: var(--assistant-lime);
    color: var(--assistant-ink);
  }
  .developer-ai-icon-button svg { width: 15px; height: 15px; }
  .developer-ai-body { min-height: 0; flex: 1; overflow: hidden; }
  .developer-ai-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: auto;
    padding: 17px 16px 18px;
    scrollbar-color: rgba(32, 38, 51, .24) transparent;
    scrollbar-width: thin;
  }
  .developer-ai-panel::-webkit-scrollbar { width: 5px; }
  .developer-ai-panel::-webkit-scrollbar-thumb { border-radius: 99px; background: rgba(32, 38, 51, .22); }
  .developer-ai-kicker {
    margin: 0 0 5px;
    color: var(--assistant-muted);
    font: 9px/1.2 var(--app-font-mono, "DM Mono", monospace);
    letter-spacing: .15em;
    text-transform: uppercase;
  }
  .developer-ai-panel-title {
    margin: 0;
    color: var(--assistant-ink);
    font-size: 20px;
    line-height: 1.08;
    letter-spacing: -.055em;
  }
  .developer-ai-panel-copy {
    margin: 7px 0 17px;
    color: var(--assistant-muted);
    font-size: 11px;
    line-height: 1.5;
  }
  .developer-ai-quick-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .developer-ai-action {
    position: relative;
    display: flex;
    min-height: 84px;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    padding: 11px;
    overflow: hidden;
    border: 1px solid var(--assistant-line);
    border-radius: 11px;
    background: rgba(255, 255, 255, .37);
    color: var(--assistant-ink);
    text-align: left;
    transition: transform .18s ease, border-color .18s ease, background .18s ease;
  }
  .developer-ai-action::after {
    position: absolute;
    right: -17px;
    bottom: -24px;
    width: 60px;
    height: 60px;
    border-radius: 50%;
    background: var(--action-color);
    content: "";
    opacity: .14;
    transition: transform .22s ease;
  }
  .developer-ai-action:hover {
    transform: translateY(-2px);
    border-color: rgba(32, 38, 51, .42);
    background: rgba(255, 255, 255, .7);
  }
  .developer-ai-action:hover::after { transform: scale(1.35); }
  .developer-ai-action-icon {
    display: grid;
    place-items: center;
    width: 25px;
    height: 25px;
    border: 1px solid currentColor;
    border-radius: 7px;
    color: var(--action-color);
  }
  .developer-ai-action-icon svg { width: 13px; height: 13px; stroke-width: 2; }
  .developer-ai-action-label { font-size: 11px; font-weight: 700; line-height: 1.15; }
  .developer-ai-action-detail { color: var(--assistant-muted); font-size: 9px; line-height: 1.3; }
  .developer-ai-action-arrow {
    position: absolute;
    top: 12px;
    right: 11px;
    color: var(--assistant-muted);
  }
  .developer-ai-action-arrow svg { width: 13px; height: 13px; }
  .developer-ai-section-label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin: 21px 0 8px;
    color: var(--assistant-muted);
    font: 9px/1.2 var(--app-font-mono, "DM Mono", monospace);
    letter-spacing: .13em;
    text-transform: uppercase;
  }
  .developer-ai-inline-link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--assistant-ink);
    font: 9px var(--app-font-mono, "DM Mono", monospace);
    letter-spacing: 0;
    text-transform: none;
  }
  .developer-ai-inline-link:hover { color: #598226; }
  .developer-ai-inline-link svg { width: 12px; height: 12px; }
  .developer-ai-status-card {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 11px;
    border: 1px solid var(--assistant-line);
    border-radius: 10px;
    background: var(--assistant-paper-deep);
  }
  .developer-ai-status-mark {
    display: grid;
    place-items: center;
    width: 29px;
    height: 29px;
    flex: 0 0 auto;
    border-radius: 8px;
    background: var(--assistant-lime);
    color: var(--assistant-ink);
  }
  .developer-ai-status-mark svg { width: 15px; height: 15px; }
  .developer-ai-status-title { display: block; font-size: 11px; font-weight: 700; }
  .developer-ai-status-copy { display: block; margin-top: 2px; color: var(--assistant-muted); font-size: 9px; line-height: 1.35; }
  .developer-ai-list { display: grid; gap: 7px; margin: 0; padding: 0; list-style: none; }
  .developer-ai-list-item {
    display: grid;
    grid-template-columns: 21px minmax(0, 1fr) auto;
    align-items: start;
    gap: 8px;
    padding: 10px;
    border: 1px solid var(--assistant-line);
    border-radius: 10px;
    background: rgba(255, 255, 255, .36);
  }
  .developer-ai-list-icon { display: grid; place-items: center; width: 21px; height: 21px; }
  .developer-ai-list-icon svg { width: 14px; height: 14px; }
  .developer-ai-list-icon.ok { color: #518c2d; }
  .developer-ai-list-icon.warning { color: #ad7812; }
  .developer-ai-list-icon.error { color: #c05743; }
  .developer-ai-list-icon.running { color: #3e8aa4; }
  .developer-ai-list-title { display: block; color: var(--assistant-ink); font-size: 10px; font-weight: 700; }
  .developer-ai-list-detail { display: block; margin-top: 3px; color: var(--assistant-muted); font-size: 9px; line-height: 1.4; }
  .developer-ai-list-time { color: var(--assistant-muted); font: 8px var(--app-font-mono, "DM Mono", monospace); white-space: nowrap; }
  .developer-ai-empty {
    padding: 18px 12px;
    border: 1px dashed rgba(32, 38, 51, .24);
    border-radius: 10px;
    color: var(--assistant-muted);
    font-size: 10px;
    line-height: 1.5;
    text-align: center;
  }
  .developer-ai-empty strong { display: block; margin-bottom: 4px; color: var(--assistant-ink); font-size: 11px; }
  .developer-ai-spinner { animation: developer-ai-spin 1s linear infinite; }
  @keyframes developer-ai-spin { to { transform: rotate(360deg); } }
  .developer-ai-chat-messages {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 9px;
    min-height: 0;
    margin: 0 -3px 12px;
    padding: 2px 3px 3px;
    overflow: auto;
  }
  .developer-ai-message { max-width: 87%; }
  .developer-ai-message.user { align-self: flex-end; }
  .developer-ai-message-bubble {
    padding: 10px 11px;
    border: 1px solid var(--assistant-line);
    border-radius: 11px 11px 11px 3px;
    background: rgba(255, 255, 255, .54);
    color: var(--assistant-ink);
    font-size: 10px;
    line-height: 1.5;
    white-space: pre-wrap;
  }
  .developer-ai-message.user .developer-ai-message-bubble {
    border-color: rgba(32, 38, 51, .84);
    border-radius: 11px 11px 3px 11px;
    background: var(--assistant-ink);
    color: var(--assistant-paper);
  }
  .developer-ai-message-time {
    display: block;
    margin-top: 4px;
    color: var(--assistant-muted);
    font: 8px var(--app-font-mono, "DM Mono", monospace);
  }
  .developer-ai-message.user .developer-ai-message-time { text-align: right; }
  .developer-ai-chat-form { display: flex; gap: 7px; margin-top: auto; }
  .developer-ai-chat-input {
    min-width: 0;
    flex: 1;
    height: 39px;
    padding: 0 11px;
    border: 1px solid var(--assistant-line);
    border-radius: 9px;
    outline: 0;
    background: rgba(255, 255, 255, .52);
    color: var(--assistant-ink);
    font-size: 10px;
  }
  .developer-ai-chat-input:focus { border-color: var(--assistant-ink); box-shadow: 0 0 0 3px rgba(199, 243, 107, .25); }
  .developer-ai-send {
    display: grid;
    place-items: center;
    width: 39px;
    height: 39px;
    flex: 0 0 auto;
    border: 1px solid var(--assistant-ink);
    border-radius: 9px;
    background: var(--assistant-lime);
    color: var(--assistant-ink);
  }
  .developer-ai-send:disabled { cursor: not-allowed; opacity: .45; }
  .developer-ai-send svg { width: 15px; height: 15px; }
  .developer-ai-form-stack { display: grid; gap: 10px; }
  .developer-ai-field { display: grid; gap: 5px; color: var(--assistant-muted); font: 9px var(--app-font-mono, "DM Mono", monospace); letter-spacing: .08em; text-transform: uppercase; }
  .developer-ai-field input {
    width: 100%;
    height: 38px;
    padding: 0 10px;
    border: 1px solid var(--assistant-line);
    border-radius: 8px;
    outline: 0;
    background: rgba(255, 255, 255, .48);
    color: var(--assistant-ink);
    font: 11px var(--app-font-sans, "Space Grotesk", sans-serif);
    letter-spacing: 0;
    text-transform: none;
  }
  .developer-ai-field input:focus { border-color: var(--assistant-ink); box-shadow: 0 0 0 3px rgba(199, 243, 107, .25); }
  .developer-ai-submit {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    width: 100%;
    min-height: 39px;
    border: 1px solid var(--assistant-ink);
    border-radius: 8px;
    background: var(--assistant-ink);
    color: var(--assistant-paper);
    font-size: 11px;
    font-weight: 700;
  }
  .developer-ai-submit:hover { background: #394354; }
  .developer-ai-submit:disabled { cursor: wait; opacity: .6; }
  .developer-ai-submit svg { width: 14px; height: 14px; }
  .developer-ai-mode-switch { display: grid; grid-template-columns: 1fr 1fr; gap: 3px; padding: 3px; margin-bottom: 15px; border-radius: 8px; background: var(--assistant-paper-deep); }
  .developer-ai-mode-button {
    min-height: 30px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--assistant-muted);
    font: 10px var(--app-font-mono, "DM Mono", monospace);
  }
  .developer-ai-mode-button.active { background: var(--assistant-paper); color: var(--assistant-ink); box-shadow: 0 1px 5px rgba(32, 38, 51, .1); }
  .developer-ai-error { margin: 9px 0 0; color: #b24f3d; font-size: 10px; line-height: 1.4; }
  .developer-ai-payment-card {
    display: grid;
    gap: 13px;
    padding: 16px;
    border: 1px solid var(--assistant-ink);
    border-radius: 12px;
    background: var(--assistant-ink);
    color: var(--assistant-paper);
    box-shadow: 3px 3px 0 rgba(32, 38, 51, .18);
  }
  .developer-ai-payment-card .developer-ai-kicker { color: rgba(251, 248, 241, .58); }
  .developer-ai-payment-card .developer-ai-panel-title { color: var(--assistant-paper); font-size: 18px; }
  .developer-ai-payment-card p { margin: 0; color: rgba(251, 248, 241, .68); font-size: 10px; line-height: 1.5; }
  .developer-ai-payment-lock { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .developer-ai-payment-lock svg { width: 17px; height: 17px; color: var(--assistant-lime); }
  .developer-ai-payment-button { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 37px; border: 1px solid var(--assistant-lime); border-radius: 8px; background: var(--assistant-lime); color: var(--assistant-ink); font-size: 10px; font-weight: 700; }
  .developer-ai-payment-button:disabled { cursor: wait; opacity: .62; }
  .developer-ai-payment-button svg { width: 14px; height: 14px; }
  .developer-ai-theme-list { display: grid; gap: 8px; }
  .developer-ai-theme-option { display: grid; grid-template-columns: 34px minmax(0, 1fr) 17px; align-items: center; gap: 9px; width: 100%; padding: 9px; border: 1px solid var(--assistant-line); border-radius: 10px; background: rgba(255, 255, 255, .35); color: var(--assistant-ink); text-align: left; }
  .developer-ai-theme-option:hover, .developer-ai-theme-option.selected { border-color: var(--assistant-ink); background: rgba(255, 255, 255, .7); }
  .developer-ai-theme-swatch { width: 34px; height: 34px; border: 1px solid rgba(32, 38, 51, .2); border-radius: 8px; box-shadow: inset -10px -10px 0 var(--theme-accent); }
  .developer-ai-theme-label { display: block; font-size: 11px; font-weight: 700; }
  .developer-ai-theme-description { display: block; margin-top: 3px; color: var(--assistant-muted); font-size: 9px; }
  .developer-ai-theme-check { display: grid; place-items: center; color: #5d8d25; }
  .developer-ai-theme-check svg { width: 15px; height: 15px; }
  @media (max-width: 520px) {
    .developer-ai-assistant { right: 14px; bottom: 14px; }
    .developer-ai-drawer { width: calc(100vw - 28px); height: min(650px, calc(100dvh - 28px)); }
  }
  @media (prefers-reduced-motion: reduce) {
    .developer-ai-drawer { animation: none; }
    .developer-ai-launcher, .developer-ai-action, .developer-ai-icon-button { transition: none; }
  }
`;

function DiagnosticStatusIcon({ status }: { status: DiagnosticStatus }) {
  if (status === 'ok') return <CheckCircle2 aria-hidden="true" />;
  if (status === 'warning') return <AlertTriangle aria-hidden="true" />;
  if (status === 'error') return <AlertTriangle aria-hidden="true" />;
  return <LoaderCircle className="developer-ai-spinner" aria-hidden="true" />;
}

function PanelHeader({
  eyebrow,
  title,
  copy,
  id,
}: {
  eyebrow: string;
  title: string;
  copy: string;
  id: string;
}) {
  return (
    <>
      <p className="developer-ai-kicker" data-testid="text-assistant-panel-eyebrow">{eyebrow}</p>
      <h2 className="developer-ai-panel-title" id={id} data-testid="text-assistant-panel-title">{title}</h2>
      <p className="developer-ai-panel-copy" data-testid="text-assistant-panel-copy">{copy}</p>
    </>
  );
}

export function DeveloperAiAssistant({
  open,
  onToggle,
  onClose,
  onPanelChange,
  onQuickAction,
  activePanel = 'overview',
  isAuthenticated = false,
  accountLabel = 'Guest session',
  diagnostics = [],
  diagnosticsLoading = false,
  diagnosticsError,
  onRefreshDiagnostics,
  messages = [],
  chatDraft = '',
  onChatDraftChange,
  onSendMessage,
  paymentStatus = 'idle',
  paymentMessage = 'No billing connection has been added yet.',
  onPaymentSetup,
  themeOptions = defaultThemes,
  selectedTheme = 'studio',
  onThemeChange,
  authMode = 'sign-in',
  onAuthModeChange,
  authEmail = '',
  authPassword = '',
  onAuthEmailChange,
  onAuthPasswordChange,
  onAuthenticate,
  authBusy = false,
  authError,
  className = '',
}: DeveloperAiAssistantProps) {
  if (!isAuthenticated) return null;

  const assistantClassName = `developer-ai-assistant ${className}`.trim();

  const handleQuickAction = (action: QuickActionDefinition) => {
    onQuickAction(action.id);
    if (action.panel) onPanelChange(action.panel);
  };

  const handleChatSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = chatDraft.trim();
    if (!value || !onSendMessage) return;
    onSendMessage(value);
  };

  const handleAuthSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onQuickAction('authenticated-login');
    onAuthenticate?.(authMode);
  };

  const renderOverview = () => (
    <section className="developer-ai-panel" aria-labelledby="assistant-overview-title">
      <PanelHeader
        id="assistant-overview-title"
        eyebrow="Developer support layer"
        title="What should we solve?"
        copy="A small control room for the work around your animation engine."
      />
      <div className="developer-ai-quick-grid" data-testid="grid-assistant-quick-actions">
        {quickActions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.id}
              type="button"
              className="developer-ai-action"
              style={{ '--action-color': `var(--assistant-${action.tone})` } as CSSProperties}
              onClick={() => handleQuickAction(action)}
              data-testid={`button-assistant-${action.id}`}
            >
              <span className="developer-ai-action-icon"><Icon aria-hidden="true" /></span>
              <span className="developer-ai-action-label">{action.label}</span>
              <span className="developer-ai-action-detail">{action.detail}</span>
              <span className="developer-ai-action-arrow"><ChevronRight aria-hidden="true" /></span>
            </button>
          );
        })}
      </div>
      <div className="developer-ai-section-label">
        <span>Workspace status</span>
        <button
          type="button"
          className="developer-ai-inline-link"
          onClick={() => onPanelChange('diagnostics')}
          data-testid="button-assistant-open-diagnostics"
        >
          View diagnostics <ChevronRight aria-hidden="true" />
        </button>
      </div>
      <div className="developer-ai-status-card" data-testid="status-assistant-workspace">
        <span className="developer-ai-status-mark"><ShieldCheck aria-hidden="true" /></span>
        <span>
          <strong className="developer-ai-status-title">{isAuthenticated ? 'Protected workspace' : 'Local workspace ready'}</strong>
          <span className="developer-ai-status-copy">{isAuthenticated ? accountLabel : 'Sign in to sync projects across devices.'}</span>
        </span>
      </div>
    </section>
  );

  const renderDiagnostics = () => (
    <section className="developer-ai-panel" aria-labelledby="assistant-diagnostics-title">
      <PanelHeader
        id="assistant-diagnostics-title"
        eyebrow="Runtime diagnostics"
        title="Keep the scene healthy"
        copy="Check the renderer, saved state, and connections before you ship a share link."
      />
      <div className="developer-ai-section-label">
        <span data-testid="text-assistant-diagnostics-count">{diagnostics.length} checks reported</span>
        {onRefreshDiagnostics && (
          <button
            type="button"
            className="developer-ai-inline-link"
            onClick={onRefreshDiagnostics}
            data-testid="button-assistant-refresh-diagnostics"
          >
            <RefreshCw aria-hidden="true" /> Refresh
          </button>
        )}
      </div>
      {diagnosticsError ? (
        <div className="developer-ai-empty" role="alert" data-testid="status-assistant-diagnostics-error">
          <strong>Diagnostics are unavailable</strong>
          {diagnosticsError}
        </div>
      ) : diagnosticsLoading ? (
        <div className="developer-ai-empty" data-testid="status-assistant-diagnostics-loading">
          <strong>Running checks</strong>
          Reading the current renderer state and saved workspace.
        </div>
      ) : diagnostics.length === 0 ? (
        <div className="developer-ai-empty" data-testid="status-assistant-diagnostics-empty">
          <strong>No checks have run</strong>
          Start a bug check to inspect this workspace.
        </div>
      ) : (
        <ul className="developer-ai-list" data-testid="list-assistant-diagnostics">
          {diagnostics.map((item) => (
            <li key={item.id} className="developer-ai-list-item" data-testid={`row-assistant-diagnostic-${item.id}`}>
              <span className={`developer-ai-list-icon ${item.status}`}><DiagnosticStatusIcon status={item.status} /></span>
              <span>
                <strong className="developer-ai-list-title">{item.label}</strong>
                {item.detail && <span className="developer-ai-list-detail">{item.detail}</span>}
              </span>
              {item.timestamp && <span className="developer-ai-list-time">{item.timestamp}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  const renderChat = () => (
    <section className="developer-ai-panel" aria-labelledby="assistant-chat-title">
      <PanelHeader
        id="assistant-chat-title"
        eyebrow="Contextual chat"
        title="Ask about the scene"
        copy="Messages stay controlled by the host app, so the assistant can connect to any model or transport."
      />
      <div className="developer-ai-chat-messages" data-testid="list-assistant-chat-messages" aria-live="polite">
        {messages.length === 0 ? (
          <div className="developer-ai-empty" data-testid="status-assistant-chat-empty">
            <strong>Start with a focused question</strong>
            Try asking why a curve is not rendering or how to tune its motion.
          </div>
        ) : (
          messages.map((message) => (
            <article key={message.id} className={`developer-ai-message ${message.role}`} data-testid={`message-assistant-chat-${message.id}`}>
              <div className="developer-ai-message-bubble">{message.content}</div>
              {message.timestamp && <span className="developer-ai-message-time">{message.timestamp}</span>}
            </article>
          ))
        )}
      </div>
      <form className="developer-ai-chat-form" onSubmit={handleChatSubmit}>
        <input
          type="text"
          className="developer-ai-chat-input"
          value={chatDraft}
          onChange={(event) => onChatDraftChange?.(event.target.value)}
          placeholder="Ask a developer question"
          aria-label="Ask a developer question"
          data-testid="input-assistant-chat"
        />
        <button
          type="submit"
          className="developer-ai-send"
          disabled={!chatDraft.trim() || !onSendMessage}
          aria-label="Send chat message"
          data-testid="button-assistant-send-chat"
        >
          <Send aria-hidden="true" />
        </button>
      </form>
    </section>
  );

  const renderPayment = () => {
    const isConnecting = paymentStatus === 'connecting';
    const isReady = paymentStatus === 'ready';
    return (
      <section className="developer-ai-panel" aria-labelledby="assistant-payment-title">
        <div className="developer-ai-payment-card" data-testid="card-assistant-payment">
          <div className="developer-ai-payment-lock">
            <span className="developer-ai-kicker">Billing connection</span>
            <LockKeyhole aria-hidden="true" />
          </div>
          <h2 className="developer-ai-panel-title" id="assistant-payment-title">{isReady ? 'Payments are connected' : 'Add a billing layer'}</h2>
          <p>{isReady ? 'Your host app reports an active payment connection.' : paymentMessage}</p>
          {onPaymentSetup && (
            <button
              type="button"
              className="developer-ai-payment-button"
              onClick={() => {
                onQuickAction('payment-setup');
                onPaymentSetup();
              }}
              disabled={isConnecting}
              data-testid="button-assistant-payment-setup"
            >
              {isConnecting ? <LoaderCircle className="developer-ai-spinner" aria-hidden="true" /> : <CreditCard aria-hidden="true" />}
              {isConnecting ? 'Connecting' : isReady ? 'Manage connection' : 'Set up payments'}
            </button>
          )}
        </div>
        <div className="developer-ai-section-label"><span>Protection notes</span></div>
        <div className="developer-ai-status-card" data-testid="status-assistant-payment-security">
          <span className="developer-ai-status-mark"><ShieldCheck aria-hidden="true" /></span>
          <span>
            <strong className="developer-ai-status-title">Credential handoff stays external</strong>
            <span className="developer-ai-status-copy">This component only signals intent; the host app owns provider credentials.</span>
          </span>
        </div>
      </section>
    );
  };

  const renderTheme = () => (
    <section className="developer-ai-panel" aria-labelledby="assistant-theme-title">
      <PanelHeader
        id="assistant-theme-title"
        eyebrow="Surface controls"
        title="Tune the atmosphere"
        copy="Choose a visual preset and let the host app decide how the rest of the studio responds."
      />
      <div className="developer-ai-theme-list" data-testid="list-assistant-themes">
        {(themeOptions.length > 0 ? themeOptions : defaultThemes).map((theme) => {
          const selected = theme.id === selectedTheme;
          return (
            <button
              key={theme.id}
              type="button"
              className={`developer-ai-theme-option ${selected ? 'selected' : ''}`}
              onClick={() => {
                onQuickAction('customization');
                onThemeChange?.(theme.id);
              }}
              data-testid={`button-assistant-theme-${theme.id}`}
            >
              <span className="developer-ai-theme-swatch" style={{ backgroundColor: theme.swatch, '--theme-accent': theme.accent ?? 'var(--assistant-lime)' } as CSSProperties} />
              <span>
                <strong className="developer-ai-theme-label">{theme.label}</strong>
                <span className="developer-ai-theme-description">{theme.description}</span>
              </span>
              {selected && <span className="developer-ai-theme-check"><CheckCircle2 aria-hidden="true" /></span>}
            </button>
          );
        })}
      </div>
    </section>
  );

  const renderAuth = () => (
    <section className="developer-ai-panel" aria-labelledby="assistant-auth-title">
      <PanelHeader
        id="assistant-auth-title"
        eyebrow="Protected access"
        title={isAuthenticated ? `Welcome back, ${accountLabel}` : 'Sign in to sync'}
        copy={isAuthenticated ? 'Your session is authenticated and ready for private workspace actions.' : 'Use the host app authentication flow to unlock saved projects and shared scenes.'}
      />
      {isAuthenticated ? (
        <div className="developer-ai-status-card" data-testid="status-assistant-authenticated">
          <span className="developer-ai-status-mark"><CircleUserRound aria-hidden="true" /></span>
          <span>
            <strong className="developer-ai-status-title">Authenticated session</strong>
            <span className="developer-ai-status-copy">{accountLabel} has access to protected workspace data.</span>
          </span>
        </div>
      ) : (
        <>
          <div className="developer-ai-mode-switch" role="tablist" aria-label="Authentication mode">
            {(['sign-in', 'sign-up'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                className={`developer-ai-mode-button ${authMode === mode ? 'active' : ''}`}
                onClick={() => onAuthModeChange?.(mode)}
                role="tab"
                aria-selected={authMode === mode}
                data-testid={`button-assistant-auth-${mode}`}
              >
                {mode === 'sign-in' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>
          <form className="developer-ai-form-stack" onSubmit={handleAuthSubmit}>
            <label className="developer-ai-field">
              Email address
              <input
                type="email"
                value={authEmail}
                onChange={(event) => onAuthEmailChange?.(event.target.value)}
                autoComplete="email"
                placeholder="you@studio.dev"
                required
                data-testid="input-assistant-auth-email"
              />
            </label>
            <label className="developer-ai-field">
              Password
              <input
                type="password"
                value={authPassword}
                onChange={(event) => onAuthPasswordChange?.(event.target.value)}
                autoComplete={authMode === 'sign-in' ? 'current-password' : 'new-password'}
                placeholder="Enter your password"
                required
                data-testid="input-assistant-auth-password"
              />
            </label>
            <button type="submit" className="developer-ai-submit" disabled={authBusy} data-testid="button-assistant-auth-submit">
              {authBusy ? <LoaderCircle className="developer-ai-spinner" aria-hidden="true" /> : <KeyRound aria-hidden="true" />}
              {authBusy ? 'Authenticating' : authMode === 'sign-in' ? 'Continue securely' : 'Create protected account'}
            </button>
          </form>
          {authError && <p className="developer-ai-error" role="alert" data-testid="status-assistant-auth-error">{authError}</p>}
        </>
      )}
    </section>
  );

  const panelContent = activePanel === 'diagnostics'
    ? renderDiagnostics()
    : activePanel === 'chat'
      ? renderChat()
      : activePanel === 'payment'
        ? renderPayment()
        : activePanel === 'theme'
          ? renderTheme()
          : activePanel === 'auth'
            ? renderAuth()
            : renderOverview();

  return (
    <div className={assistantClassName}>
      <style>{assistantStyles}</style>
      {!open ? (
        <button
          type="button"
          className="developer-ai-launcher"
          onClick={onToggle}
          aria-expanded={false}
          aria-label="Open Developer AI Assistant"
          data-testid="button-open-developer-ai-assistant"
        >
          <span className="developer-ai-launcher-mark"><Bot aria-hidden="true" /></span>
          <span className="developer-ai-launcher-pulse" aria-hidden="true" />
          Developer AI
        </button>
      ) : (
        <aside className="developer-ai-drawer" role="dialog" aria-label="Developer AI Assistant" data-testid="drawer-developer-ai-assistant">
          <header className="developer-ai-header">
            <div className="developer-ai-heading">
              <span className="developer-ai-avatar"><Sparkles aria-hidden="true" /></span>
              <span>
                <h1 className="developer-ai-title">Developer AI Assistant</h1>
                <span className="developer-ai-subtitle">{isAuthenticated ? `Connected · ${accountLabel}` : 'Local support layer · ready'}</span>
              </span>
            </div>
            <div className="developer-ai-header-actions">
              {activePanel !== 'overview' && (
                <button
                  type="button"
                  className="developer-ai-icon-button"
                  onClick={() => onPanelChange('overview')}
                  aria-label="Back to assistant overview"
                  data-testid="button-assistant-back"
                >
                  <ArrowLeft aria-hidden="true" />
                </button>
              )}
              <button
                type="button"
                className="developer-ai-icon-button"
                onClick={onClose}
                aria-label="Close Developer AI Assistant"
                data-testid="button-close-developer-ai-assistant"
              >
                <X aria-hidden="true" />
              </button>
            </div>
          </header>
          <div className="developer-ai-body">{panelContent}</div>
        </aside>
      )}
    </div>
  );
}

export default DeveloperAiAssistant;