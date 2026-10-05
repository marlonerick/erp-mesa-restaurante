'use client';

import { Button } from '@/ui/button';

/** Imprime a página pelo navegador (E9-6) — também serve para "salvar como PDF". */
export function PrintButton() {
  return (
    <Button
      type="button"
      variant="secondary"
      className="print:hidden"
      onClick={() => {
        window.print();
      }}
    >
      Imprimir
    </Button>
  );
}
