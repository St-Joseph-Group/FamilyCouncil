import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.stjosephgroup.familycouncil',
  appName: 'Family Council',
  // Capacitor ships the compiled Vite output, so `npm run build` must run
  // before `npx cap sync`. There is no dev server in the packaged app.
  webDir: 'dist',
  android: {
    // The app talks to Supabase and the edge functions over HTTPS only.
    // Cleartext stays off so a misconfigured URL fails loudly rather than
    // silently sending traffic unencrypted.
    allowMixedContent: false,
  },
  ios: {
    // Honour the safe-area insets we set in CSS rather than letting iOS pad
    // the WebView itself, which would double the offset under the notch.
    contentInset: 'never',
  },
  server: {
    // Served from the bundle. Both platforms present an https-like origin,
    // which the Supabase client and the edge functions (Allow-Origin: *)
    // both accept without extra CORS work.
    androidScheme: 'https',
  },
};

export default config;
