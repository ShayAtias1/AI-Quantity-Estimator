/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** PostHog project API key (public, write-only). Missing → analytics is off. */
  readonly VITE_POSTHOG_KEY?: string;
  /** PostHog ingestion host, e.g. https://eu.i.posthog.com. Missing → analytics is off. */
  readonly VITE_POSTHOG_HOST?: string;
  /** 'true' → log analytics events to the console instead of sending them (works in dev). */
  readonly VITE_ANALYTICS_DEBUG?: string;
}

/** Short git SHA of the build, injected by vite.config.ts (`app_version` in analytics). */
declare const __APP_VERSION__: string;
