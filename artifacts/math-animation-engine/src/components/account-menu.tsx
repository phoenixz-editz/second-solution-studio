import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, CircleUserRound, LogIn, LogOut, UserRound, X } from 'lucide-react';
import { basePath } from '@/lib/clerk-config';

const PROFILE_STORAGE_PREFIX = 'second-solution-profile-';
const ACCOUNT_STORAGE_KEY = 'second-solution-account';
const ACCOUNT_EVENT = 'second-solution-account-change';

export type AccountIdentity = {
  isLoaded: boolean;
  isSignedIn: boolean;
  isPrivileged: boolean;
  username: string;
  email: string;
  roleLabel: 'Admin' | 'Developer' | 'Member';
  initials: string;
};

function normalizeUsername(value: string) {
  return value
    .toLowerCase()
    .replace(/@.*/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
}

function createUniqueUsername(email: string, userId: string) {
  const base = normalizeUsername(email) || 'member';
  const tag = userId.replace(/[^a-z0-9]/gi, '').slice(-6).toLowerCase() || 'account';
  return `${base}-${tag}`;
}

function initialsFor(username: string, email: string) {
  const source = username || email || 'SS';
  const pieces = source.split(/[-\s@._]+/).filter(Boolean);
  return (pieces.length > 1 ? `${pieces[0][0]}${pieces[1][0]}` : source.slice(0, 2)).toUpperCase();
}

type StoredAccount = {
  username: string;
  email: string;
  roleLabel: AccountIdentity['roleLabel'];
};

export function setStoredAccount(account: StoredAccount) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(account));
  window.dispatchEvent(new Event(ACCOUNT_EVENT));
}

export function clearStoredAccount() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(ACCOUNT_STORAGE_KEY);
  window.dispatchEvent(new Event(ACCOUNT_EVENT));
}

export function useAccountIdentity(privilegedEmail = ''): AccountIdentity {
  const [storedAccount, setStoredAccountState] = useState<StoredAccount | null>(null);

  useEffect(() => {
    const readAccount = () => {
      try {
        const raw = window.localStorage.getItem(ACCOUNT_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) as Partial<StoredAccount> : null;
        if (parsed?.email && parsed.username && (parsed.roleLabel === 'Admin' || parsed.roleLabel === 'Developer' || parsed.roleLabel === 'Member')) {
          setStoredAccountState({
            username: parsed.username,
            email: parsed.email,
            roleLabel: parsed.roleLabel,
          });
          return;
        }
      } catch {
        // Guest mode remains available if storage is unavailable or malformed.
      }
      setStoredAccountState(null);
    };
    readAccount();
    window.addEventListener('storage', readAccount);
    window.addEventListener(ACCOUNT_EVENT, readAccount);
    return () => {
      window.removeEventListener('storage', readAccount);
      window.removeEventListener(ACCOUNT_EVENT, readAccount);
    };
  }, []);

  useEffect(() => {
    if (!storedAccount || typeof window === 'undefined') return;
    const storageKey = `${PROFILE_STORAGE_PREFIX}${storedAccount.email}`;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ username: storedAccount.username }));
    } catch {
      // Profile persistence is best effort.
    }
  }, [storedAccount]);

  return useMemo(() => {
    const email = storedAccount?.email || '';
    const privilegedEmailMatch = Boolean(privilegedEmail && email.toLowerCase() === privilegedEmail.toLowerCase());
    const isPrivileged = Boolean(storedAccount && (storedAccount.roleLabel === 'Developer' || storedAccount.roleLabel === 'Admin' || privilegedEmailMatch));
    const roleLabel = storedAccount?.roleLabel || 'Member';
    const username = storedAccount?.username || (email ? createUniqueUsername(email, email) : '');
    return {
      isLoaded: true,
      isSignedIn: Boolean(storedAccount),
      isPrivileged,
      username,
      email,
      roleLabel,
      initials: initialsFor(username, email),
    };
  }, [privilegedEmail, storedAccount]);
}

type AccountMenuProps = {
  identity: AccountIdentity;
  onAuth?: (mode: 'sign-in' | 'sign-up') => void;
};

export function AccountMenu({ identity, onAuth }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  if (!identity.isLoaded) return null;

  if (!identity.isSignedIn) {
    return (
      <div className="account-auth-actions" data-testid="account-auth-actions">
        <button type="button" className="account-auth-button" onClick={() => onAuth?.('sign-in')} data-testid="button-account-login">
          <LogIn className="icon" /> Login
        </button>
        <button type="button" className="account-auth-button emphasis" onClick={() => onAuth?.('sign-up')} data-testid="button-account-signup">
          Sign up
        </button>
      </div>
    );
  }

  const handleSignOut = async () => {
    setOpen(false);
    setProfileOpen(false);
    clearStoredAccount();
  };

  return (
    <div className="account-menu" data-testid="account-menu">
      <button
        type="button"
        className="account-avatar-button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Open account menu for ${identity.username}`}
        data-testid="button-account-avatar"
      >
        <span className="account-avatar-mark">{identity.initials}</span>
        <span className="account-avatar-name">{identity.username}</span>
        <ChevronDown className={`icon account-avatar-chevron ${open ? 'is-open' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="account-menu-popover" role="menu" aria-label="Account menu">
          <div className="account-menu-summary">
            <span className="account-menu-summary-mark"><CircleUserRound className="icon" /></span>
            <span>
              <strong>{identity.username}</strong>
              <small>{identity.email || 'Protected studio account'}</small>
              <em>{identity.roleLabel}</em>
            </span>
          </div>
          <button type="button" className="account-menu-item" role="menuitem" onClick={() => setProfileOpen((value) => !value)} data-testid="button-account-profile">
            <UserRound className="icon" /> Profile <ChevronDown className={`icon account-menu-item-chevron ${profileOpen ? 'is-open' : ''}`} />
          </button>
          {profileOpen && (
            <div className="account-profile-detail" data-testid="account-profile-detail">
              <span>Username</span><strong>{identity.username}</strong>
              <span>Access</span><strong>{identity.roleLabel}</strong>
            </div>
          )}
          <a className="account-menu-item" role="menuitem" href={`${basePath}/studio#saved-graphs`} onClick={() => setOpen(false)} data-testid="link-account-saved-graphs">
            <CircleUserRound className="icon" /> Saved Graphs
          </a>
          <button type="button" className="account-menu-item account-menu-logout" role="menuitem" onClick={() => void handleSignOut()} data-testid="button-account-logout">
            <LogOut className="icon" /> Logout
          </button>
          <button type="button" className="account-menu-dismiss" onClick={() => setOpen(false)} aria-label="Close account menu">
            <X className="icon" />
          </button>
        </div>
      )}
    </div>
  );
}