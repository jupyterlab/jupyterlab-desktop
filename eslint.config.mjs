// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/build',
      '**/lib',
      '**/node_modules',
      '**/mock_packages',
      '**/static',
      '**/typings',
      '**/schemas',
      '**/themes',
      'coverage',
      '**/*.map.js',
      '**/*.bundle.js',
      'typedoc-theme/',
      '.history/',
      '.vscode/',
      'env_installer',
      'src/assets/uFuzzy.iife.min.js'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.commonjs,
        JSX: 'readonly',
        NodeJS: true,
        BufferEncoding: true,
        Electron: true
      }
    },
    rules: {
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'interface',
          format: ['PascalCase'],
          custom: {
            regex: '^I[A-Z]',
            match: true
          }
        }
      ],
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { args: 'none', caughtErrors: 'none' }
      ],
      // Noisy on the `let x = <default>` then conditional-reassign pattern used
      // throughout, where the default is read in branches that do not reassign.
      'no-useless-assignment': 'off',
      '@typescript-eslint/no-use-before-define': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-namespace': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/ban-ts-comment': ['warn', { 'ts-ignore': true }],
      '@typescript-eslint/no-non-null-asserted-optional-chain': 'warn',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/triple-slash-reference': 'warn',
      '@typescript-eslint/no-inferrable-types': 'off',
      camelcase: [
        'warn',
        {
          allow: [
            '__webpack_public_path__',
            '__webpack_share_scopes__',
            '__webpack_init_sharing__',
            'allow_stdin',
            'allowed_extensions',
            'allowed_extensions_uris',
            'blocked_extensions',
            'blocked_extensions_uris',
            'bundles_extension',
            'cell_type',
            'clear_output',
            'codemirror_mode',
            'comm_close',
            'comm_id',
            'comm_msg',
            'comm_open',
            'copy_from',
            'creation_date',
            'cursor_end',
            'cursor_pos',
            'cursor_start',
            'detail_level',
            'display_data',
            'display_id',
            'display_name',
            'embed_options',
            'execute_input',
            'execute_result',
            'execution_count',
            'execution_state',
            'extension_data',
            'extension_name',
            'file_extension',
            'help_links',
            'hist_access_type',
            'implementation_version',
            'installed_version',
            'jlab_core',
            'jupyterlab_extensions',
            'jupyterlab_mime_extensions',
            'kernel_spec',
            'language_info',
            'last_modified',
            'last_update_date',
            'latest_version',
            'lineWrap_type',
            'msg_type',
            'msg_id',
            'msgid_plural',
            'nbconverter_exporter',
            'nbformat_minor',
            'orig_nbformat',
            'output_mimetype',
            'output_type',
            'outputs_hidden',
            'parent_header',
            'pf_re',
            'pkg_type',
            'protocol_version',
            'pygments_lexer',
            'request_seq',
            'slide_type',
            'source_hidden',
            'shutdown_reply',
            'stop_on_error',
            'store_history',
            'target_name',
            'target_module',
            'UNSAFE_componentWillUpdate',
            'UNSAFE_componentWillReceiveProps',
            'user_expressions'
          ]
        }
      ],
      'id-match': ['error', '^[a-zA-Z_]+[a-zA-Z0-9_]*$'], // https://certitude.consulting/blog/en/invisible-backdoor/
      'no-inner-declarations': 'off',
      'no-prototype-builtins': 'off',
      'no-control-regex': 'warn',
      'no-undef': 'warn',
      'no-case-declarations': 'warn',
      'no-useless-escape': 'off',
      'prefer-const': 'off',
      'sort-imports': [
        'error',
        {
          ignoreCase: true,
          ignoreDeclarationSort: true,
          ignoreMemberSort: false,
          memberSyntaxSortOrder: ['none', 'all', 'multiple', 'single'],
          allowSeparatedGroups: false
        }
      ]
    }
  },
  prettier
);
