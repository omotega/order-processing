const path = require('path');
const tsConfigPaths = require('tsconfig-paths');

/**
 * Runtime resolver for Nest watch / production when dist still contains
 * path aliases (or as a safety net before tsc-alias rewrites).
 */
const baseUrl = path.join(__dirname, '..', 'dist');

tsConfigPaths.register({
  baseUrl,
  paths: {
    '@/*': ['./*'],
    '@database/repository/*': ['./database/repository/*'],
  },
});
