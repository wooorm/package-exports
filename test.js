/**
 * @typedef {import('package-exports').Export} Export
 */

/**
 * @typedef {Omit<Export, 'url'> & {url: string}} SimpleExport
 */

import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import test from 'node:test'
import {packageExports} from 'package-exports'

const base = new URL('fixtures/', import.meta.url)

await clean()

test('package-exports', async function (t) {
  await t.test('should expose the public api', async function () {
    assert.deepEqual(Object.keys(await import('package-exports')).sort(), [
      'packageExports'
    ])
  })
})

test('packageExports', async function (t) {
  t.after(clean)

  await t.test('should work for this package', async function () {
    const result = await packageExports(new URL('.', import.meta.url))

    assert.deepEqual(result.exports, [
      {
        conditions: undefined,
        exists: true,
        jsonPath: ['exports'],
        specifier: '.',
        url: new URL('index.js', import.meta.url).href
      }
    ])
    assert.deepEqual(result.file.messages, [])
    assert.deepEqual(result.name, 'package-exports')
  })

  await t.test('should work', async function () {
    await check(
      {name: 'x', type: 'module', exports: './index.js', files: ['index.js']},
      [['index.js']],
      [
        {
          conditions: undefined,
          exists: true,
          jsonPath: ['exports'],
          specifier: '.',
          url: 'index.js'
        }
      ],
      []
    )
  })

  await t.test('should warn on non-string export main', async function () {
    await check(
      {name: 'x', type: 'module', exports: 1, files: []},
      [],
      [],
      [
        [
          'Unexpected missing main specifier `.`, expected an export to the main module',
          'package-exports:exports-main-missing'
        ],
        [
          'Unexpected invalid value `1` at `exports` which is not importable, expected specifier object, conditions object, `string` (path to file), or `null` (negated)',
          'package-exports:exports-value-invalid'
        ]
      ]
    )
  })

  await t.test('should warn on non-prefixed export main', async function () {
    await check(
      {name: 'x', type: 'module', exports: 'a.js', files: []},
      [],
      [],
      [
        [
          'Unexpected missing main specifier `.`, expected an export to the main module',
          'package-exports:exports-main-missing'
        ],
        [
          "Unexpected unprefixed value `'a.js'` at `exports` which is not importable, did you mean `'./a.js'`",
          'package-exports:exports-path-unprefixed'
        ]
      ]
    )
  })

  await t.test('should warn on an empty `exports` array', async function () {
    await check(
      {name: 'x', type: 'module', exports: [], files: []},
      [],
      [],
      [
        [
          'Unexpected missing main specifier `.`, expected an export to the main module',
          'package-exports:exports-main-missing'
        ],
        [
          'Unexpected empty array at `exports` doing nothing, expected a single item',
          'package-exports:exports-alternatives-empty'
        ]
      ]
    )
  })

  await t.test('should support an `exports` array', async function () {
    await check(
      {name: 'x', type: 'module', exports: ['./a.js'], files: ['a.js']},
      [['a.js']],
      [
        {
          conditions: undefined,
          exists: true,
          jsonPath: ['exports', 0],
          specifier: '.',
          url: 'a.js'
        }
      ],
      [
        [
          'Unexpected alternatives list at `exports`, several tools don’t support this and pick the first item',
          'package-exports:exports-alternatives'
        ]
      ]
    )
  })

  await t.test(
    'should warn on invalid values in `exports` array',
    async function () {
      await check(
        {name: 'x', type: 'module', exports: [1], files: []},
        [],
        [],
        [
          [
            'Unexpected missing main specifier `.`, expected an export to the main module',
            'package-exports:exports-main-missing'
          ],
          [
            'Unexpected alternatives list at `exports`, several tools don’t support this and pick the first item',
            'package-exports:exports-alternatives'
          ],
          [
            'Unexpected invalid value `1` at `exports[0]` which is not importable, expected specifier object, conditions object, `string` (path to file), or `null` (negated)',
            'package-exports:exports-value-invalid'
          ]
        ]
      )
    }
  )

  await t.test(
    'should warn on superfluous `exports` array items',
    async function () {
      await check(
        {
          name: 'x',
          type: 'module',
          exports: ['./a.js', './b.js'],
          files: ['*.js']
        },
        [['a.js'], ['b.js']],
        [
          {
            conditions: undefined,
            exists: true,
            jsonPath: ['exports', 0],
            specifier: '.',
            url: 'a.js'
          }
        ],
        [
          [
            'Unexpected alternatives list at `exports`, several tools don’t support this and pick the first item',
            'package-exports:exports-alternatives'
          ]
        ]
      )
    }
  )

  await t.test(
    'should support an `exports` object (specifiers)',
    async function () {
      await check(
        {
          name: 'x',
          type: 'module',
          exports: {'.': './index.js'},
          files: ['index.js']
        },
        [['index.js']],
        [
          {
            conditions: undefined,
            exists: true,
            jsonPath: ['exports', '.'],
            specifier: '.',
            url: 'index.js'
          }
        ],
        [
          [
            'Unexpected verbose specifier object with sole key `.` at `exports`, replace the object with the value at `.`',
            'package-exports:exports-specifiers-verbose'
          ]
        ]
      )
    }
  )

  await t.test('should warn on an empty `exports` object', async function () {
    await check(
      {name: 'x', type: 'module', exports: {}, files: []},
      [],
      [],
      [
        [
          'Unexpected missing main specifier `.`, expected an export to the main module',
          'package-exports:exports-main-missing'
        ],
        [
          'Unexpected empty object at `exports` doing nothing, expected fields',
          'package-exports:exports-object-empty'
        ]
      ]
    )
  })

  await t.test('should warn on a mixed `exports` object', async function () {
    await check(
      {
        name: 'x',
        type: 'module',
        exports: {'.': './a.js', x: './b.js'},
        files: ['*.js']
      },
      [['a.js'], ['b.js']],
      [],
      [
        [
          'Unexpected missing main specifier `.`, expected an export to the main module',
          'package-exports:exports-main-missing'
        ],
        [
          'Unexpected mixed specifiers (starting with `.`) and conditions (without `.`) at `exports`, expected either specifiers or conditions',
          'package-exports:exports-object-mixed'
        ]
      ]
    )
  })

  await t.test(
    'should support an `exports` object (conditions)',
    async function () {
      await check(
        {
          name: 'x',
          type: 'module',
          exports: {deno: './index.js'},
          files: ['index.js']
        },
        [['index.js']],
        [
          {
            conditions: ['deno'],
            exists: true,
            jsonPath: ['exports', 'deno'],
            specifier: '.',
            url: 'index.js'
          }
        ],
        [
          [
            "Unexpected conditions without a `default` entry at `exports` making specifier `.` unusable by default, expected `'default'` condition as the last field",
            'package-exports:exports-conditions-default-missing'
          ]
        ]
      )
    }
  )

  await t.test(
    'should warn on a specifiers in specifiers (one)',
    async function () {
      await check(
        {
          name: 'x',
          type: 'module',
          exports: {'./a': {'./b': './a.js'}},
          files: []
        },
        [],
        [],
        [
          [
            'Unexpected missing main specifier `.`, expected an export to the main module',
            'package-exports:exports-main-missing'
          ],
          [
            "Unexpected nested specifier `./b` at `exports['./a']`, expected conditions",
            'package-exports:exports-specifier-nested'
          ]
        ]
      )
    }
  )

  await t.test(
    'should warn on a specifiers in specifiers (multiple)',
    async function () {
      await check(
        {
          name: 'x',
          type: 'module',
          exports: {'./a': {'./b': './a.js', './c': './b.js'}},
          files: []
        },
        [],
        [],
        [
          [
            'Unexpected missing main specifier `.`, expected an export to the main module',
            'package-exports:exports-main-missing'
          ],
          [
            "Unexpected nested specifiers `./b` and `./c` at `exports['./a']`, expected conditions",
            'package-exports:exports-specifier-nested'
          ]
        ]
      )
    }
  )

  await t.test(
    'should warn for specifiers set to invalid values',
    async function () {
      await check(
        {name: 'x', type: 'module', exports: {'.': false}, files: []},
        [],
        [],
        [
          [
            'Unexpected missing main specifier `.`, expected an export to the main module',
            'package-exports:exports-main-missing'
          ],
          [
            'Unexpected verbose specifier object with sole key `.` at `exports`, replace the object with the value at `.`',
            'package-exports:exports-specifiers-verbose'
          ],
          [
            "Unexpected invalid value `false` at `exports['.']` which is not importable, expected conditions object, `string` (path to file), or `null` (negated)",
            'package-exports:exports-value-invalid'
          ]
        ]
      )
    }
  )

  await t.test('should support specifiers set to arrays', async function () {
    await check(
      {name: 'x', type: 'module', exports: {'.': ['./a.js']}, files: ['a.js']},
      [['a.js']],
      [
        {
          conditions: undefined,
          exists: true,
          jsonPath: ['exports', '.', 0],
          specifier: '.',
          url: 'a.js'
        }
      ],
      [
        [
          'Unexpected verbose specifier object with sole key `.` at `exports`, replace the object with the value at `.`',
          'package-exports:exports-specifiers-verbose'
        ],
        [
          "Unexpected alternatives list at `exports['.']`, several tools don’t support this and pick the first item",
          'package-exports:exports-alternatives'
        ]
      ]
    )
  })

  await t.test('should support specifiers using a wildcard', async function () {
    await check(
      {name: 'x', type: 'module', exports: {'./*': './lib/*'}, files: ['lib/']},
      [['lib/index.js']],
      [
        {
          conditions: undefined,
          exists: true,
          jsonPath: ['exports', './*'],
          specifier: './index.js',
          url: 'lib/index.js'
        }
      ],
      [
        [
          'Unexpected missing main specifier `.`, expected an export to the main module',
          'package-exports:exports-main-missing'
        ]
      ]
    )
  })

  await t.test(
    'should warn for useless wildcards pointing to one file',
    async function () {
      await check(
        {
          name: 'x',
          type: 'module',
          exports: {'./*': './index.js'},
          files: ['index.js']
        },
        [['index.js']],
        [
          {
            conditions: undefined,
            exists: true,
            jsonPath: ['exports', './*'],
            specifier: './*',
            url: 'index.js'
          }
        ],
        [
          [
            'Unexpected missing main specifier `.`, expected an export to the main module',
            'package-exports:exports-main-missing'
          ],
          [
            "Unexpected dynamic specifier `./*` pointing to static file `./index.js` at `exports['./*']`, use dynamic specifiers with dynamic file globs",
            'package-exports:exports-specifier-wildcard-useless'
          ]
        ]
      )
    }
  )

  await t.test('should warn for multiple wildcards', async function () {
    await check(
      {
        name: 'x',
        type: 'module',
        exports: {'./a*/b*': './index.js'},
        files: ['index.js']
      },
      [['index.js']],
      [],
      [
        [
          'Unexpected missing main specifier `.`, expected an export to the main module',
          'package-exports:exports-main-missing'
        ],
        [
          "Unexpected extra wildcard in dynamic specifier `./a*/b*` at `exports['./a*/b*']`, one wildcard is allowed",
          'package-exports:exports-specifier-wildcard-invalid'
        ]
      ]
    )
  })

  await t.test('should warn for wildcards w/o results', async function () {
    await check(
      {
        name: 'x',
        type: 'module',
        exports: {'./*': './lib/*'},
        files: ['index.js']
      },
      [['index.js']],
      [],
      [
        [
          'Unexpected missing main specifier `.`, expected an export to the main module',
          'package-exports:exports-main-missing'
        ],
        [
          "Unexpected dynamic file glob `./lib/*` at `exports['./*']` pointing to nothing, expected files",
          'package-exports:exports-path-wildcard-not-found'
        ]
      ]
    )
  })

  await t.test('should support multiple wildcards in path', async function () {
    await check(
      {
        name: 'x',
        type: 'module',
        exports: {'./*': './a/*/b/*.js'},
        files: ['a/']
      },
      [
        ['a/x/b/x.js'],
        ['a/x/b/y.js'],
        ['a/x/c/x.js'],
        ['a/x/c/y.js'],
        ['a/y/b/x.js'],
        ['a/y/b/y.js'],
        ['a/y/c/x.js'],
        ['a/y/c/y.js']
      ],
      [
        {
          conditions: undefined,
          exists: true,
          jsonPath: ['exports', './*'],
          specifier: './x',
          url: 'a/x/b/x.js'
        },
        {
          conditions: undefined,
          exists: true,
          jsonPath: ['exports', './*'],
          specifier: './y',
          url: 'a/y/b/y.js'
        }
      ],
      [
        [
          'Unexpected missing main specifier `.`, expected an export to the main module',
          'package-exports:exports-main-missing'
        ]
      ]
    )
  })

  await t.test('should support conditions in conditions', async function () {
    await check(
      {
        name: 'x',
        type: 'module',
        exports: {deno: {production: './index.js'}},
        files: ['index.js']
      },
      [['index.js']],
      [
        {
          conditions: ['deno', 'production'],
          exists: true,
          jsonPath: ['exports', 'deno', 'production'],
          specifier: '.',
          url: 'index.js'
        }
      ],
      [
        [
          "Unexpected conditions without a `default` entry at `exports` making specifier `.` unusable by default, expected `'default'` condition as the last field",
          'package-exports:exports-conditions-default-missing'
        ],
        [
          "Unexpected conditions without a `default` entry at `exports.deno` making specifier `.` unusable by default, expected `'default'` condition as the last field",
          'package-exports:exports-conditions-default-missing'
        ]
      ]
    )
  })

  await t.test('should support conditions set to arrays', async function () {
    await check(
      {
        name: 'x',
        type: 'module',
        exports: {deno: ['./index.js']},
        files: ['index.js']
      },
      [['index.js']],
      [
        {
          conditions: ['deno'],
          exists: true,
          jsonPath: ['exports', 'deno', 0],
          specifier: '.',
          url: 'index.js'
        }
      ],
      [
        [
          "Unexpected conditions without a `default` entry at `exports` making specifier `.` unusable by default, expected `'default'` condition as the last field",
          'package-exports:exports-conditions-default-missing'
        ],
        [
          'Unexpected alternatives list at `exports.deno`, several tools don’t support this and pick the first item',
          'package-exports:exports-alternatives'
        ]
      ]
    )
  })

  await t.test(
    'should warn for conditions set to non-string',
    async function () {
      await check(
        {name: 'x', type: 'module', exports: {default: 1}, files: []},
        [],
        [],
        [
          [
            'Unexpected missing main specifier `.`, expected an export to the main module',
            'package-exports:exports-main-missing'
          ],
          [
            'Unexpected verbose conditions object with sole key `default` at `exports`, replace the object with the value at `default`',
            'package-exports:exports-conditions-verbose'
          ],
          [
            'Unexpected invalid value `1` at `exports.default` which is not importable, expected specifier object, conditions object, `string` (path to file), or `null` (negated)',
            'package-exports:exports-value-invalid'
          ]
        ]
      )
    }
  )

  await t.test(
    'should warn for conditions w/ a non-last default',
    async function () {
      await check(
        {
          name: 'x',
          type: 'module',
          exports: {default: './a.js', deno: './b.js'},
          files: ['*.js']
        },
        [['a.js'], ['b.js']],
        [
          {
            conditions: ['default'],
            exists: true,
            jsonPath: ['exports', 'default'],
            specifier: '.',
            url: 'a.js'
          },
          {
            conditions: ['deno'],
            exists: true,
            jsonPath: ['exports', 'deno'],
            specifier: '.',
            url: 'b.js'
          }
        ],
        [
          [
            'Unexpected non-last `default` conditions at `exports` ignoring everything after it, move the `default` condition to the end',
            'package-exports:exports-conditions-default-misplaced'
          ]
        ]
      )
    }
  )

  await t.test(
    'should warn for mutually exclusive conditions (runtime)',
    async function () {
      await check(
        {
          name: 'x',
          type: 'module',
          exports: {deno: {node: {browser: './index.js'}}},
          files: ['index.js']
        },
        [['index.js']],
        [
          {
            conditions: ['deno', 'node', 'browser'],
            exists: true,
            jsonPath: ['exports', 'deno', 'node', 'browser'],
            specifier: '.',
            url: 'index.js'
          }
        ],
        [
          [
            "Unexpected conditions without a `default` entry at `exports` making specifier `.` unusable by default, expected `'default'` condition as the last field",
            'package-exports:exports-conditions-default-missing'
          ],
          [
            "Unexpected conditions without a `default` entry at `exports.deno` making specifier `.` unusable by default, expected `'default'` condition as the last field",
            'package-exports:exports-conditions-default-missing'
          ],
          [
            "Unexpected conditions without a `default` entry at `exports.deno.node` making specifier `.` unusable by default, expected `'default'` condition as the last field",
            'package-exports:exports-conditions-default-missing'
          ],
          [
            'Unexpected condition `node` mutually exclusive with `deno` at `exports.deno` which never matches, use only one of these conditions',
            'package-exports:exports-conditions-mutually-exclusive'
          ],
          [
            'Unexpected condition `browser` mutually exclusive with `deno` at `exports.deno.node` which never matches, use only one of these conditions',
            'package-exports:exports-conditions-mutually-exclusive'
          ]
        ]
      )
    }
  )

  await t.test(
    'should warn for mutually exclusive conditions (development/production)',
    async function () {
      await check(
        {
          name: 'x',
          type: 'module',
          exports: {development: {production: './index.js'}},
          files: ['index.js']
        },
        [['index.js']],
        [
          {
            conditions: ['development', 'production'],
            exists: true,
            jsonPath: ['exports', 'development', 'production'],
            specifier: '.',
            url: 'index.js'
          }
        ],
        [
          [
            "Unexpected conditions without a `default` entry at `exports` making specifier `.` unusable by default, expected `'default'` condition as the last field",
            'package-exports:exports-conditions-default-missing'
          ],
          [
            "Unexpected conditions without a `default` entry at `exports.development` making specifier `.` unusable by default, expected `'default'` condition as the last field",
            'package-exports:exports-conditions-default-missing'
          ],
          [
            'Unexpected condition `production` mutually exclusive with `development` at `exports.development` which never matches, use only one of these conditions',
            'package-exports:exports-conditions-mutually-exclusive'
          ]
        ]
      )
    }
  )

  await t.test('should warn for exposed non-existing files', async function () {
    await check(
      {name: 'x', type: 'module', exports: './missing.js', files: []},
      [],
      [
        {
          conditions: undefined,
          exists: false,
          jsonPath: ['exports'],
          specifier: '.',
          url: 'missing.js'
        }
      ],
      [
        [
          'Unexpected missing file `./missing.js` for specifier `.` at `exports`',
          'package-exports:exports-path-not-found'
        ]
      ]
    )
  })

  await t.test('should warn for a useless `null`', async function () {
    await check(
      {
        name: 'x',
        type: 'module',
        exports: {'.': './a.js', './x': null},
        files: ['a.js']
      },
      [['a.js']],
      [
        {
          conditions: undefined,
          exists: true,
          jsonPath: ['exports', '.'],
          specifier: '.',
          url: 'a.js'
        }
      ],
      [
        [
          "Unexpected negation specifier `./x` at `exports['./x']` with nothing to negate",
          'package-exports:exports-negated-missing'
        ]
      ]
    )
  })

  await t.test('should warn for a useless `null` at root', async function () {
    await check(
      {name: 'x', type: 'module', exports: null, files: []},
      [],
      [],
      [
        [
          'Unexpected missing main specifier `.`, expected an export to the main module',
          'package-exports:exports-main-missing'
        ],
        [
          'Unexpected negation specifier `.` at `exports` with nothing to negate',
          'package-exports:exports-negated-missing'
        ]
      ]
    )
  })

  await t.test('should support a useful `null`', async function () {
    await check(
      {
        name: 'x',
        type: 'module',
        exports: {'.': './index.js', './*': './*.js', './index': null},
        files: ['*.js']
      },
      [['example.js'], ['index.js'], ['test.js']],
      [
        {
          conditions: undefined,
          exists: true,
          jsonPath: ['exports', '.'],
          specifier: '.',
          url: 'index.js'
        },
        {
          conditions: undefined,
          exists: true,
          jsonPath: ['exports', './*'],
          specifier: './example',
          url: 'example.js'
        },
        {
          conditions: undefined,
          exists: true,
          jsonPath: ['exports', './*'],
          specifier: './test',
          url: 'test.js'
        }
      ],
      []
    )
  })

  await t.test('should not allow a conditional `null`', async function () {
    await check(
      {
        name: 'x',
        type: 'module',
        exports: {node: {'./*': './*'}, default: {'./*': null}},
        files: ['index.js']
      },
      [['index.js']],
      [
        {
          conditions: ['node'],
          exists: true,
          jsonPath: ['exports', 'node', './*'],
          specifier: './index.js',
          url: 'index.js'
        },
        {
          conditions: ['node'],
          exists: true,
          jsonPath: ['exports', 'node', './*'],
          specifier: './package.json',
          url: 'package.json'
        }
      ],
      [
        [
          'Unexpected missing main specifier `.`, expected an export to the main module',
          'package-exports:exports-main-missing'
        ],
        [
          "Unexpected negation specifier `./*` at `exports.default['./*']` with nothing to negate",
          'package-exports:exports-negated-missing'
        ]
      ]
    )
  })

  await t.test(
    'should warn for an existing but npm ignored file (`files`)',
    async function () {
      await check(
        {
          name: 'x',
          type: 'module',
          exports: {'.': './a.js', './x': './b.js'},
          files: ['a.js']
        },
        [['a.js'], ['b.js']],
        [
          {
            conditions: undefined,
            exists: true,
            jsonPath: ['exports', '.'],
            specifier: '.',
            url: 'a.js'
          },
          {
            conditions: undefined,
            exists: true,
            jsonPath: ['exports', './x'],
            specifier: './x',
            url: 'b.js'
          }
        ],
        [
          [
            "Unexpected file `./b.js` at `exports['./x']` which is excluded from the npm package, add it to `files` in `package.json`",
            'package-exports:npm-ignored'
          ]
        ]
      )
    }
  )

  await t.test(
    'should warn for an existing but npm ignored file (`.npmignore`)',
    async function () {
      await check(
        {name: 'x', type: 'module', exports: {'.': './a.js', './x': './b.js'}},
        [['a.js'], ['b.js'], ['.npmignore', 'b.js']],
        [
          {
            conditions: undefined,
            exists: true,
            jsonPath: ['exports', '.'],
            specifier: '.',
            url: 'a.js'
          },
          {
            conditions: undefined,
            exists: true,
            jsonPath: ['exports', './x'],
            specifier: './x',
            url: 'b.js'
          }
        ],
        [
          [
            'Unexpected missing `files` field, expected array of allowed files to include',
            'package-exports:files-missing'
          ],
          [
            "Unexpected file `./b.js` at `exports['./x']` which is excluded from the npm package, remove it from `.npmignore`",
            'package-exports:npm-ignored'
          ]
        ]
      )
    }
  )

  await t.test('should warn for useless `types`', async function () {
    await check(
      {
        name: 'x',
        type: 'module',
        exports: {types: './index.d.mts', default: './index.mjs'},
        files: ['*.d.mts', '*.mjs']
      },
      [['index.d.mts'], ['index.mjs']],
      [
        {
          conditions: ['types'],
          exists: true,
          jsonPath: ['exports', 'types'],
          specifier: '.',
          url: 'index.d.mts'
        },
        {
          conditions: ['default'],
          exists: true,
          jsonPath: ['exports', 'default'],
          specifier: '.',
          url: 'index.mjs'
        }
      ],
      [
        [
          'Unexpected verbose `types` condition at `exports` matching what TypeScript would load for `default` without it, remove it',
          'package-exports:exports-types-verbose'
        ]
      ]
    )
  })

  await t.test(
    'should warn if `exports` and `main` are used',
    async function () {
      await check(
        {
          name: 'x',
          type: 'module',
          main: './index.js',
          exports: './index.js',
          files: ['index.js']
        },
        [['index.js']],
        [
          {
            conditions: undefined,
            exists: true,
            jsonPath: ['exports'],
            specifier: '.',
            url: 'index.js'
          }
        ],
        [
          [
            'Unexpected unused legacy `main` field with modern `exports`, remove it',
            'package-exports:main-extra'
          ]
        ]
      )
    }
  )

  await t.test(
    'should warn if `main` is defined but non-string',
    async function () {
      await check(
        {name: 'x', type: 'module', main: 1, files: []},
        [],
        [
          {
            conditions: undefined,
            exists: true,
            jsonPath: [],
            specifier: './package.json',
            url: 'package.json'
          }
        ],
        [
          [
            'Unexpected non-string `main` field `1`',
            'package-exports:main-invalid'
          ]
        ]
      )
    }
  )

  await t.test('should support `main` (w/o prefix)', async function () {
    await check(
      {name: 'x', type: 'module', main: 'index.js', files: ['index.js']},
      [['index.js']],
      [
        {
          conditions: undefined,
          exists: true,
          jsonPath: ['main'],
          specifier: '.',
          url: 'index.js'
        },
        {
          conditions: undefined,
          exists: true,
          jsonPath: [],
          specifier: './index.js',
          url: 'index.js'
        },
        {
          conditions: undefined,
          exists: true,
          jsonPath: [],
          specifier: './package.json',
          url: 'package.json'
        }
      ],
      [
        [
          'Unexpected legacy `main` field that does not encapsulate the package, it’s recommended to use an export map such as `"exports": "./index.js"`',
          'package-exports:main'
        ]
      ]
    )
  })

  await t.test('should support `main` (w/ `./` prefix)', async function () {
    await check(
      {name: 'x', type: 'module', main: './index.js', files: ['index.js']},
      [['index.js']],
      [
        {
          conditions: undefined,
          exists: true,
          jsonPath: ['main'],
          specifier: '.',
          url: 'index.js'
        },
        {
          conditions: undefined,
          exists: true,
          jsonPath: [],
          specifier: './index.js',
          url: 'index.js'
        },
        {
          conditions: undefined,
          exists: true,
          jsonPath: [],
          specifier: './package.json',
          url: 'package.json'
        }
      ],
      [
        [
          'Unexpected legacy `main` field that does not encapsulate the package, it’s recommended to use an export map such as `"exports": "./index.js"`',
          'package-exports:main'
        ]
      ]
    )
  })

  await t.test(
    'should not support `main` (w/o extension, esm)',
    async function () {
      await check(
        {
          name: 'x',
          type: 'module',
          main: 'default',
          files: ['default.js']
        },
        [['default.js']],
        [
          {
            conditions: undefined,
            exists: true,
            jsonPath: [],
            specifier: './default.js',
            url: 'default.js'
          },
          {
            conditions: undefined,
            exists: true,
            jsonPath: [],
            specifier: './package.json',
            url: 'package.json'
          }
        ],
        [
          [
            'Unexpected `main` field `default` that does not resolve with `type: \'module\'`, use an export map such as `"exports": "./default.js"`',
            'package-exports:main-resolve-module'
          ]
        ]
      )
    }
  )

  await t.test('should support `main` (w/o extension, cjs)', async function () {
    await check(
      {name: 'x', type: 'commonjs', main: 'default', files: ['default.js']},
      [['default.js']],
      [
        {
          conditions: undefined,
          exists: true,
          jsonPath: ['main'],
          specifier: '.',
          url: 'default.js'
        },
        {
          conditions: undefined,
          exists: true,
          jsonPath: [],
          specifier: './default.js',
          url: 'default.js'
        },
        {
          conditions: undefined,
          exists: true,
          jsonPath: [],
          specifier: './package.json',
          url: 'package.json'
        }
      ],
      [
        [
          "Unexpected `main` field `default` that resolves to `./default.js` in CJS, this works but is slow and doesn’t work with `type: 'module', use the resolved value explicitly",
          'package-exports:main-resolve-commonjs'
        ]
      ]
    )
  })

  await t.test('should not missing `main`', async function () {
    await check(
      {name: 'x', type: 'module', main: 'missing', files: ['default.js']},
      [['default.js']],
      [
        {
          conditions: undefined,
          exists: true,
          jsonPath: [],
          specifier: './default.js',
          url: 'default.js'
        },
        {
          conditions: undefined,
          exists: true,
          jsonPath: [],
          specifier: './package.json',
          url: 'package.json'
        }
      ],
      [
        [
          'Unexpected missing file for `main` field `missing`',
          'package-exports:main-not-found'
        ]
      ]
    )
  })

  await t.test('should support missing `main` (`index.js`)', async function () {
    await check(
      {name: 'x', type: 'module', files: ['index.js']},
      [['index.js']],
      [
        {
          conditions: undefined,
          exists: true,
          jsonPath: [],
          specifier: '.',
          url: 'index.js'
        },
        {
          conditions: undefined,
          exists: true,
          jsonPath: [],
          specifier: './index.js',
          url: 'index.js'
        },
        {
          conditions: undefined,
          exists: true,
          jsonPath: [],
          specifier: './package.json',
          url: 'package.json'
        }
      ],
      [
        [
          'Unexpected inferred main export `./index.js`, it’s recommended to use an export map such as `"exports": "./index.js"`',
          'package-exports:main-inferred'
        ]
      ]
    )
  })

  await t.test('should warn for no main', async function () {
    await check(
      {name: 'x', type: 'module', files: ['default.js']},
      [['default.js']],
      [
        {
          conditions: undefined,
          exists: true,
          jsonPath: [],
          specifier: './default.js',
          url: 'default.js'
        },
        {
          conditions: undefined,
          exists: true,
          jsonPath: [],
          specifier: './package.json',
          url: 'package.json'
        }
      ],
      [
        [
          'Unexpected missing main module, it’s recommended to use an export map such as `"exports": "./index.js"`',
          'package-exports:main-missing'
        ]
      ]
    )
  })

  await t.test('should warn for no `name`', async function () {
    await check(
      {type: 'module', exports: './index.js', files: ['*.js']},
      [['index.js']],
      [
        {
          conditions: undefined,
          exists: true,
          jsonPath: ['exports'],
          specifier: '.',
          url: 'index.js'
        }
      ],
      [
        [
          'Unexpected missing `name` field, expected a package name',
          'package-exports:name-missing'
        ]
      ]
    )
  })

  await t.test('should warn for no `type`', async function () {
    await check(
      {name: 'x', exports: './index.js', files: ['*.js']},
      [['index.js']],
      [
        {
          conditions: undefined,
          exists: true,
          jsonPath: ['exports'],
          specifier: '.',
          url: 'index.js'
        }
      ],
      [
        [
          "Unexpected missing `type` field, expected `type: 'commonjs'` or `'module'`",
          'package-exports:type-missing'
        ]
      ]
    )
  })

  await t.test('should warn for invalid `type`', async function () {
    await check(
      {name: 'x', type: 'fooscript', exports: './index.js', files: ['*.js']},
      [['index.js']],
      [
        {
          conditions: undefined,
          exists: true,
          jsonPath: ['exports'],
          specifier: '.',
          url: 'index.js'
        }
      ],
      [
        [
          'Unexpected invalid `type` value `fooscript`, expected `commonjs` or `module`',
          'package-exports:type-invalid'
        ]
      ]
    )
  })
})

test('node docs', async function (t) {
  t.after(clean)

  // https://nodejs.org/api/packages.html#package-entry-points
  await t.test('package entry points (1)', async function () {
    await check(
      {
        name: 'x',
        exports: {
          '.': './lib/index.js',
          './lib': './lib/index.js',
          './lib/index': './lib/index.js',
          './lib/index.js': './lib/index.js',
          './feature': './feature/index.js',
          './feature/index': './feature/index.js',
          './feature/index.js': './feature/index.js',
          './package.json': './package.json'
        },
        files: ['lib/', 'feature/']
      },
      [['lib/index.js'], ['feature/index.js']],
      [
        {
          conditions: undefined,
          exists: true,
          jsonPath: ['exports', '.'],
          specifier: '.',
          url: 'lib/index.js'
        },
        {
          conditions: undefined,
          exists: true,
          jsonPath: ['exports', './lib'],
          specifier: './lib',
          url: 'lib/index.js'
        },
        {
          conditions: undefined,
          exists: true,
          jsonPath: ['exports', './lib/index'],
          specifier: './lib/index',
          url: 'lib/index.js'
        },
        {
          conditions: undefined,
          exists: true,
          jsonPath: ['exports', './lib/index.js'],
          specifier: './lib/index.js',
          url: 'lib/index.js'
        },
        {
          conditions: undefined,
          exists: true,
          jsonPath: ['exports', './feature'],
          specifier: './feature',
          url: 'feature/index.js'
        },
        {
          conditions: undefined,
          exists: true,
          jsonPath: ['exports', './feature/index'],
          specifier: './feature/index',
          url: 'feature/index.js'
        },
        {
          conditions: undefined,
          exists: true,
          jsonPath: ['exports', './feature/index.js'],
          specifier: './feature/index.js',
          url: 'feature/index.js'
        },
        {
          conditions: undefined,
          exists: true,
          jsonPath: ['exports', './package.json'],
          specifier: './package.json',
          url: 'package.json'
        }
      ],
      [
        [
          "Unexpected missing `type` field, expected `type: 'commonjs'` or `'module'`",
          'package-exports:type-missing'
        ],
        [
          'Unexpected extension `.js` in specifier `./feature/index.js` at `exports`, extensions have no meaning in specifiers, remove it',
          'package-exports:exports-specifier-extension'
        ],
        [
          'Unexpected extension `.js` in specifier `./lib/index.js` at `exports`, extensions have no meaning in specifiers, remove it',
          'package-exports:exports-specifier-extension'
        ],
        [
          'Unexpected extension `.json` in specifier `./package.json` at `exports`, extensions have no meaning in specifiers, expected `./package`',
          'package-exports:exports-specifier-extension'
        ]
      ]
    )
  })

  await t.test('package entry points (3)', async function () {
    await check(
      {
        name: 'x',
        exports: {
          '.': './lib/index.js',
          './feature/*.js': './feature/*.js',
          './feature/internal/*': null
        },
        files: ['lib/', 'feature/']
      },
      [
        ['lib/index.js'],
        ['feature/a.js'],
        ['feature/b.js'],
        ['feature/internal/a.js'],
        ['feature/internal/b.js']
      ],
      [
        {
          conditions: undefined,
          exists: true,
          jsonPath: ['exports', '.'],
          specifier: '.',
          url: 'lib/index.js'
        },
        {
          conditions: undefined,
          exists: true,
          jsonPath: ['exports', './feature/*.js'],
          specifier: './feature/a.js',
          url: 'feature/a.js'
        },
        {
          conditions: undefined,
          exists: true,
          jsonPath: ['exports', './feature/*.js'],
          specifier: './feature/b.js',
          url: 'feature/b.js'
        }
      ],
      [
        [
          "Unexpected missing `type` field, expected `type: 'commonjs'` or `'module'`",
          'package-exports:type-missing'
        ],
        [
          'Unexpected extension `.js` in specifier `./feature/*.js` at `exports`, extensions have no meaning in specifiers, expected `./feature/*`',
          'package-exports:exports-specifier-extension'
        ]
      ]
    )
  })

  // <https://nodejs.org/api/packages.html#conditional-exports>
  await t.test('conditional exports (1)', async function () {
    await check(
      {
        name: 'x',
        exports: {import: './index-module.js', require: './index-require.cjs'},
        type: 'module',
        files: ['*.cjs', '*.js']
      },
      [['index-module.js'], ['index-require.cjs']],
      [
        {
          conditions: ['import'],
          exists: true,
          jsonPath: ['exports', 'import'],
          specifier: '.',
          url: 'index-module.js'
        },
        {
          conditions: ['require'],
          exists: true,
          jsonPath: ['exports', 'require'],
          specifier: '.',
          url: 'index-require.cjs'
        }
      ],
      []
    )
  })

  await t.test('conditional exports (2)', async function () {
    await check(
      {
        name: 'x',
        exports: {
          '.': './index.js',
          './feature.js': {
            node: './feature-node.js',
            default: './feature.js'
          }
        },
        files: ['index.js', 'feature-node.js', 'feature.js']
      },
      [['index.js'], ['feature-node.js'], ['feature.js']],
      [
        {
          conditions: undefined,
          exists: true,
          jsonPath: ['exports', '.'],
          specifier: '.',
          url: 'index.js'
        },
        {
          conditions: ['node'],
          exists: true,
          jsonPath: ['exports', './feature.js', 'node'],
          specifier: './feature.js',
          url: 'feature-node.js'
        },
        {
          conditions: ['default'],
          exists: true,
          jsonPath: ['exports', './feature.js', 'default'],
          specifier: './feature.js',
          url: 'feature.js'
        }
      ],
      [
        [
          "Unexpected missing `type` field, expected `type: 'commonjs'` or `'module'`",
          'package-exports:type-missing'
        ],
        [
          'Unexpected extension `.js` in specifier `./feature.js` at `exports`, extensions have no meaning in specifiers, expected `./feature`',
          'package-exports:exports-specifier-extension'
        ]
      ]
    )
  })

  // <https://nodejs.org/api/packages.html#nested-conditions>
  await t.test('nested conditions (1)', async function () {
    await check(
      {
        name: 'x',
        exports: {
          node: {import: './feature-node.mjs', require: './feature-node.cjs'},
          default: './feature.mjs'
        },
        files: ['*.cjs', '*.mjs']
      },
      [['feature-node.mjs'], ['feature-node.cjs'], ['feature.mjs']],
      [
        {
          conditions: ['node', 'import'],
          exists: true,
          jsonPath: ['exports', 'node', 'import'],
          specifier: '.',
          url: 'feature-node.mjs'
        },
        {
          conditions: ['node', 'require'],
          exists: true,
          jsonPath: ['exports', 'node', 'require'],
          specifier: '.',
          url: 'feature-node.cjs'
        },
        {
          conditions: ['default'],
          exists: true,
          jsonPath: ['exports', 'default'],
          specifier: '.',
          url: 'feature.mjs'
        }
      ],
      [
        [
          "Unexpected missing `type` field, expected `type: 'commonjs'` or `'module'`",
          'package-exports:type-missing'
        ]
      ]
    )
  })

  // <https://nodejs.org/api/packages.html#dual-commonjses-module-packages>
  await t.test('dual packages (1)', async function () {
    await check(
      {
        type: 'module',
        exports: {import: './wrapper.mjs', require: './index.cjs'},
        files: '*.js'
      },
      [['wrapper.mjs'], ['index.cjs']],
      [
        {
          conditions: ['import'],
          exists: true,
          jsonPath: ['exports', 'import'],
          specifier: '.',
          url: 'wrapper.mjs'
        },
        {
          conditions: ['require'],
          exists: true,
          jsonPath: ['exports', 'require'],
          specifier: '.',
          url: 'index.cjs'
        }
      ],
      [
        [
          'Unexpected missing `name` field, expected a package name',
          'package-exports:name-missing'
        ]
      ]
    )
  })
})

/**
 * @param {Record<string, unknown>} packageValue
 * @param {ReadonlyArray<[url: string, value?: string | undefined]>} files
 * @param {ReadonlyArray<SimpleExport>} foundExports
 * @param {ReadonlyArray<[origin: string, reason: string]>} foundMessages
 * @returns {Promise<undefined>}
 */
async function check(packageValue, files, foundExports, foundMessages) {
  const folderUrl = new URL(temporary() + '/', base)
  const packageUrl = new URL('package.json', folderUrl)

  await fs.mkdir(folderUrl)
  await fs.writeFile(packageUrl, JSON.stringify(packageValue, undefined, 2))

  await Promise.all(
    files.map(async function ([file, value]) {
      const fileUrl = new URL(file, folderUrl)
      const parentUrl = new URL('.', fileUrl)
      await fs.mkdir(parentUrl, {recursive: true})
      return fs.writeFile(fileUrl, value || '')
    })
  )

  const result = await packageExports(folderUrl)

  assert.deepEqual(
    {
      exports: result.exports,
      messages: result.file.messages.map((d) => [
        d.reason,
        d.source + ':' + d.ruleId
      ])
    },
    {
      exports: foundExports.map(function (d) {
        return {...d, url: new URL(d.url, folderUrl).href}
      }),
      messages: foundMessages
    }
  )

  await fs.rm(folderUrl, {recursive: true})
}

/**
 * @returns {Promise<undefined>}
 */
async function clean() {
  try {
    await fs.rm(base, {recursive: true})
  } catch {}

  await fs.mkdir(base)
}

/**
 * @returns {string}
 */
function temporary() {
  return Math.random().toString(36).slice(2)
}
