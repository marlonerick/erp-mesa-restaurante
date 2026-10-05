'use client';

import { useState } from 'react';
import { v7 as uuidv7 } from 'uuid';
import type { FormState } from '@/shared/errors/form-state';

/**
 * Chave de idempotência por INTENÇÃO (docs/api/convencoes.md §3): a mesma enquanto a pessoa reenvia
 * (internet caiu), outra depois que deu certo.
 */
export function useIntentKey(state: FormState | null) {
  const submittedAt = state?.submittedAt ?? 0;
  const [key, setKey] = useState(() => ({ value: uuidv7(), at: submittedAt }));
  if (key.at !== submittedAt) setKey({ value: uuidv7(), at: submittedAt });
  return key.value;
}
