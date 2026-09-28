// Perguntas no terminal para os comandos de instalação.
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';

export async function ask(question: string, fallback?: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const suffix = fallback ? ` [${fallback}]` : '';
    const answer = (await rl.question(`${question}${suffix}: `)).trim();
    return answer.length > 0 ? answer : (fallback ?? '');
  } finally {
    rl.close();
  }
}

/** Lê uma senha sem mostrar o que é digitado. */
export function askHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!stdin.isTTY) {
      reject(new Error('Terminal não interativo: informe a senha pela variável ADMIN_PASSWORD.'));
      return;
    }
    stdout.write(`${question}: `);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const onData = (char: string) => {
      if (char === '\r' || char === '\n') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.off('data', onData);
        stdout.write('\n');
        resolve(value);
      } else if (char === '\u0003') {
        process.exit(130); // Ctrl+C
      } else if (char === '\u0008' || char === '\u007f') {
        value = value.slice(0, -1);
      } else {
        value += char;
      }
    };
    stdin.on('data', onData);
  });
}
