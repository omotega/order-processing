module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint/eslint-plugin'],
  extends: [
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
  ],
  root: true,
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: ['.eslintrc.js'],
  rules: {
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    'no-restricted-imports': [
      'error',
      {
        patterns: relativeImportRestriction(),
      },
    ],
  },
  overrides: [
    {
      files: ['src/**/*.ts'],
      excludedFiles: ['src/transfer/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              ...relativeImportRestriction(),
              {
                group: ['@/transfer/*', '@/transfer/*/**'],
                message:
                  'Import the transfer module from @/transfer. Deep imports are internal.',
              },
            ],
          },
        ],
      },
    },
    {
      files: ['src/**/*.ts'],
      excludedFiles: ['src/banking/**/*.ts', 'src/transfer/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              ...relativeImportRestriction(),
              {
                group: ['@/transfer/*', '@/transfer/*/**'],
                message:
                  'Import the transfer module from @/transfer. Deep imports are internal.',
              },
              {
                group: ['@/banking/*', '@/banking/*/**'],
                message:
                  'Import the banking module from @/banking. Deep imports are internal.',
              },
            ],
          },
        ],
      },
    },
  ],
};

function relativeImportRestriction() {
  return [
    {
      group: [
        './*',
        '../*',
        '../../*',
        '../../../*',
        '../../../../*',
        '../../../../../*',
      ],
      message:
        'Use @/ or @database/repository/ aliases instead of relative imports.',
    },
  ];
}
