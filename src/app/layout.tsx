import type { Metadata, Viewport } from 'next';

import { publicEnv } from '@/lib/env';

import './globals.css';
import { GeistSans } from 'geist/font/sans';

import { cn } from '@/lib/utils';

/*
 * Geist from Vercel's own `geist` npm package, NOT `next/font/google`.
 *
 * Same reasoning as the IBM Plex import in the website layout: next/font/google
 * downloads the font from fonts.googleapis.com during `next build`, which turns
 * a Google outage — or any build sandbox without egress — into a failed deploy.
 * The `geist` package ships the woff2 files, so `npm ci` is the only fetch.
 */


/*
 * `new URL()` throws on a malformed value, and this runs at module load in the
 * root layout — so a site URL of "afriorbit.space" with no scheme, or one with
 * a stray trailing space from a copy-paste, takes down every page on the site
 * including the setup page that would have explained it. Falling back is
 * strictly better than a blank 500.
 */
function metadataBaseUrl(): URL {
  try {
    return new URL(publicEnv.siteUrl);
  } catch {
    console.error(
      `[layout] NEXT_PUBLIC_SITE_URL is not a valid absolute URL: ${JSON.stringify(publicEnv.siteUrl)}. ` +
        'It needs a scheme, e.g. https://learn.afriorbit.space (no trailing slash). ' +
        'Falling back to localhost so the site still renders.',
    );
    return new URL('http://localhost:3000');
  }
}

export const metadata: Metadata = {
  metadataBase: metadataBaseUrl(),
  title: {
    default: 'AfriOrbit Learning — Satellite & IoT Engineering Training',
    template: '%s · AfriOrbit Learning',
  },
  description:
    'Hands-on CubeSat and satellite-to-IoT engineering training from AfriOrbit Space, built around the EduSat platform and IoT edge device.',
  openGraph: {
    type: 'website',
    siteName: 'AfriOrbit Learning',
    title: 'AfriOrbit Learning',
    description:
      'Hands-on CubeSat and satellite-to-IoT engineering training built around the EduSat platform.',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#05070d',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={cn('font-sans', GeistSans.variable)}>
      <body className="min-h-dvh antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-ion-600 focus:px-4 focus:py-2 focus:text-white"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
