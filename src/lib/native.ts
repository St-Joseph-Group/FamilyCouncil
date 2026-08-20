import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';

/** True only inside the iOS/Android WebView, false in any browser. */
export const isNative = (): boolean => Capacitor.isNativePlatform();

/**
 * Marks <html> so the native-only CSS in index.css applies, and matches the
 * status bar to the app's dark chrome. Safe to call on the web: it returns
 * immediately rather than touching plugins that only exist in the shell.
 */
export async function initNativeShell(): Promise<void> {
  if (!isNative()) return;

  document.documentElement.classList.add('native-shell');

  try {
    // Light glyphs, because every screen sits on slate-950.
    await StatusBar.setStyle({ style: Style.Dark });

    if (Capacitor.getPlatform() === 'android') {
      // Android has no notch insets to honour, so keep the WebView below the
      // status bar instead of drawing under it. iOS is handled by
      // env(safe-area-inset-*) in CSS plus contentInset:'never' in the config.
      await StatusBar.setOverlaysWebView({ overlay: false });
      await StatusBar.setBackgroundColor({ color: '#020617' });
    }
  } catch {
    // A status bar that fails to style is cosmetic. Never let it stop boot.
  }
}

/**
 * Wires Android's hardware/gesture back button to in-app navigation.
 *
 * The app keeps its current screen in a single `currentPath` state and never
 * touches browser history, so without this the WebView treats every back press
 * as "nothing to go back to" and closes the app - even from a detail screen.
 *
 * Keeps its own stack of visited paths: back pops to the previous screen, and
 * only exits once there is nothing left to pop. iOS is unaffected; it has no
 * hardware back button and uses its own edge-swipe.
 */
export function useHardwareBackButton(
  currentPath: string,
  navigate: (path: string) => void,
  homePath: string,
): void {
  const stack = useRef<string[]>([]);
  // Read the live values inside the listener without re-registering it on
  // every navigation, which would drop presses during the swap.
  const navRef = useRef(navigate);
  const homeRef = useRef(homePath);
  navRef.current = navigate;
  homeRef.current = homePath;

  useEffect(() => {
    if (!currentPath) return;
    const s = stack.current;
    // Ignore repeats so pressing back does not stall on a duplicate entry.
    if (s[s.length - 1] !== currentPath) s.push(currentPath);
  }, [currentPath]);

  useEffect(() => {
    if (!isNative()) return;

    let remove: (() => void) | undefined;

    CapacitorApp.addListener('backButton', () => {
      const s = stack.current;
      s.pop(); // current screen
      const previous = s[s.length - 1];

      if (previous) {
        navRef.current(previous);
      } else if (homeRef.current) {
        // Nothing recorded but we know where home is: go there rather than
        // quitting, so a back press early in the session is not destructive.
        navRef.current(homeRef.current);
      } else {
        CapacitorApp.exitApp();
      }
    }).then((handle) => {
      remove = () => handle.remove();
    });

    return () => remove?.();
  }, []);
}
