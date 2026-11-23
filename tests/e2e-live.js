'use strict';
// Abre o Chrome visível e roda o teste E2E devagar, para acompanhar ao vivo.
process.env.HEADED = '1';
process.env.SLOW = process.env.SLOW || '450';
require('./e2e');
