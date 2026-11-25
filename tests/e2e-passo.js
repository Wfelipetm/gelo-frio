'use strict';
// Abre o Chrome visível e roda o teste E2E PASSO A PASSO: pausa antes de cada passo.
// Para liberar o próximo, crie o arquivo indicado em PASSO (ex.: echo 1 > passo.txt; o número = quantos passos liberar).
process.env.HEADED = '1';
process.env.SLOW = process.env.SLOW || '700';
process.env.PASSO = process.env.PASSO || require('path').join(require('os').tmpdir(), 'friogest-e2e-passo.txt');
console.log('Arquivo de liberação: ' + process.env.PASSO);
require('./e2e');
