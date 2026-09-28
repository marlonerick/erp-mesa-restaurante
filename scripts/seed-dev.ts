// Dados FICTÍCIOS para desenvolvimento (regra inviolável 8 do README).
// Etapa 1: ainda não há tabelas de negócio. A partir da Etapa 2 este script cria empresa,
// loja, usuários de exemplo etc.
// Uso: npm run db:seed

if (process.env.NODE_ENV === 'production') {
  console.error('O seed de desenvolvimento nunca roda em produção.');
  process.exit(1);
}

console.info('Nada a semear na Etapa 1 (sem tabelas de negócio ainda).');
