'use strict';
// Roda o teste E2E tirando um print por passo e gera test-report/relatorio-e2e.html (ações explicadas + imagens).
const path = require('path');
process.env.SHOTS = process.env.SHOTS || path.join(__dirname, '..', 'test-report');
require('./e2e');
