'use client';

import { useEffect, useRef } from 'react';
import { lockScreenAction } from '@/modules/auth/interface/actions';

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const;

/**
 * Aparelho compartilhado (E2-3): sem toque/tecla por `timeoutSeconds`, encerra a sessão no
 * servidor e volta para "Quem está usando?". O servidor também expira a sessão sozinho — isto
 * só faz a tela acompanhar.
 */
export function InactivityLock({ timeoutSeconds }: { readonly timeoutSeconds: number }) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const restart = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void lockScreenAction();
      }, timeoutSeconds * 1000);
    };
    restart();
    for (const event of ACTIVITY_EVENTS) window.addEventListener(event, restart, { passive: true });
    return () => {
      clearTimeout(timer.current);
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, restart);
    };
  }, [timeoutSeconds]);

  return null;
}
