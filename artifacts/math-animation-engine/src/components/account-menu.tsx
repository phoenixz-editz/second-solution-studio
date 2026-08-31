import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, CircleUserRound, LogIn, LogOut, UserRound, X } from 'lucide-react';
import { useClerk, useUser } from '@clerk/react';
import { basePath } from '@/lib/clerk-config';

const PROFILE_STORAGE_PREFIX = 'second-solution-profile-';

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

export function useAccountIdentity(privilegedEmail = ''): AccountIdentity {
  const { isLoaded, isSignedIn, user } = useUser();
  const [profileUsername, setProfileUsername] = useState('');

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user || typeof window === 'undefined') {
      setProfileUsername('');
      return;
    }

    const email = user.primaryEmailAddress?.emailAddress
      || user.emailAddresses[0]?.emailAddress
      || '';
    const storageKey = `${PROFILE_STORAGE_PREFIX}${user.id}`;
    let storedUsername = '';
    try {
      const stored = JSON.parse(window.localStorage.getItem(storageKey) || '{}') as { username?: unknown };
      if (typeof stored.username === 'string') storedUsername = stored.username;
    } catch {
      // Profile persistence is best effort; Clerk remains the source of identity.
    }

    const username = user.username || storedUsername || createUniqueUsername(email, user.id);
    setProfileUsername(username);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ username }));
    } catch {
      // Private browsing may deny storage without affecting the account menu.
    }

    if (!user.username) {
      void user.update({ username }).catch(() => undefined);
    }
  }, [isLoaded, isSignedIn, user]);

  return useMemo(() => {
    const email = user?.primaryEmailAddress?.emailAddress || user?.emailAddresses[0]?.emailAddress || '';
    const metadata = (user?.publicMetadata ?? {}) as Record<string, unknown>;
    const role = String(metadata.role ?? metadata.userRole ?? '').toLowerCase();
    const privilegedEmailMatch = Boolean(privilegedEmail && email.toLowerCase() === privilegedEmail.toLowerCase());
    const isPrivileged = Boolean(isSignedIn && (role === 'developer' || role === 'admin' || privilegedEmailMatch));
    const roleLabel: AccountIdentity['roleLabel'] = role === 'admin'
      ? 'Admin'
      : isPrivileged
        ? 'Developer'
        : 'Member';
    const username = profileUsername || user?.username || (email ? createUniqueUsername(email, user?.id || '') : '');
    return {
      isLoaded,
      isSignedIn: Boolean(isSignedIn),
      isPrivileged,
      username,
      email,
      roleLabel,
      initials: initialsFor(username, email),
    };
  }, [isLoaded, isSignedIn, privilegedEmail, profileUsername, user]);
}

type AccountMenuProps = {
  identity: AccountIdentity;
  onAuth?: (mode: 'sign-in' | 'sign-up') => void;
};

export function AccountMenu({ identity, onAuth }: AccountMenuProps) {
  const { signOut } = useClerk();
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
    await signOut();
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