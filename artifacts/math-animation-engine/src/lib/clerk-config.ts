import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';

export const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const browserHostname = typeof window !== 'undefined' ? window.location.hostname : '';
const browserOrigin = typeof window !== 'undefined' ? window.location.origin : '';
export const clerkPubKey = publishableKeyFromHost(
  browserHostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
export const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

export const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${browserOrigin}${basePath}/logo.svg`,
    socialButtonsPlacement: 'top' as const,
    socialButtonsVariant: 'blockButton' as const,
  },
  variables: {
    colorPrimary: '#c7f36b',
    colorForeground: '#eef4f1',
    colorMutedForeground: '#94a8a3',
    colorDanger: '#ff8b6d',
    colorBackground: '#121c24',
    colorInput: '#0d151c',
    colorInputForeground: '#eef4f1',
    colorNeutral: '#39504f',
    fontFamily: 'Space Grotesk, sans-serif',
    borderRadius: '8px',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#121c24] rounded-2xl w-[440px] max-w-full overflow-hidden',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#f4f7ed]',
    headerSubtitle: 'text-[#94a8a3]',
    socialButtonsBlockButtonText: 'text-[#eef4f1]',
    formFieldLabel: 'text-[#eef4f1]',
    footerActionLink: 'text-[#c7f36b]',
    footerActionText: 'text-[#94a8a3]',
    dividerText: 'text-[#94a8a3]',
    identityPreviewEditButton: 'text-[#c7f36b]',
    formFieldSuccessText: 'text-[#c7f36b]',
    alertText: 'text-[#ffab94]',
    logoBox: 'rounded-lg',
    logoImage: 'rounded-lg',
    socialButtonsBlockButton: 'border-[#39504f] bg-[#1a2830] hover:bg-[#22343b]',
    formButtonPrimary: 'bg-[#c7f36b] text-[#0b1018] hover:bg-[#d7ff8c]',
    formFieldInput: 'border-[#39504f] bg-[#0d151c] text-[#eef4f1]',
    footerAction: 'bg-transparent',
    dividerLine: 'bg-[#39504f]',
    alert: 'border-[#ff8b6d]/40 bg-[#ff8b6d]/10',
    otpCodeFieldInput: 'border-[#39504f] bg-[#0d151c] text-[#eef4f1]',
    formFieldRow: 'gap-2',
    main: 'bg-transparent',
  },
};
