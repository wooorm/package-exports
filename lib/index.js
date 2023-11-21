/**
 * @typedef {import('jsonc-parser').Node} Node
 * @typedef {import('type-fest').PackageJson} PackageJson
 * @typedef {import('vfile-location').Location} Location
 * @typedef {import('vfile-message').Options} Options
 */

/**
 * @typedef {Omit<RawExport, 'filePath' | 'globbed' | 'jsonPathOrder'>} Export
 *   Export.
 *
 * @typedef {AddInfoExtraFields & Info} AddInfo
 *   Info.
 *
 * @typedef AddInfoExtraFields
 *   Extra info.
 * @property {boolean} definitelyExists
 *   Whether this file definitely exists.
 * @property {boolean} explicitlyDefined
 *   Whether this file was explicitly defined by the user.
 *
 * @typedef Info
 *   Info about the current path.
 * @property {ReadonlyArray<String> | undefined} conditions
 *   Conditions.
 * @property {ReadonlyArray<number | string>} path
 *   Path in `package.json`.
 * @property {ReadonlyArray<number>} pathOrder
 *   Order in `package.json`.
 * @property {string | undefined} specifier
 *   Specifier.
 *
 * @typedef MutuallyExclusiveInfo
 *   Info about mutually exclusive conditions.
 * @property {ReadonlyArray<string>} conditions
 *   Conditions that cannot be used together.
 * @property {boolean} exhaustive
 *   Whether specifying all conditions in a conditions object means no
 *   `default` is needed.
 *   To illustrate, this is `true` for `import` and `require`, but not for
 *   `production` and `development`.
 *
 * @typedef NegatedExport
 *   Negated export.
 * @property {ReadonlyArray<string> | undefined} conditions
 *   Conditions.
 * @property {ReadonlyArray<number | string>} jsonPath
 *   Path in `package.json`.
 * @property {ReadonlyArray<number>} jsonPathOrder
 *   Order in `package.json`.
 * @property {string} specifier
 *   Raw specifier as used in export map.
 *
 * @typedef State
 *   Info passed around.
 * @property {Array<RawExport>} exports
 *   Exports.
 * @property {VFile} file
 *   File.
 * @property {Location} location
 *   Location map.
 * @property {Array<NegatedExport>} negatedExports
 *   Negated exports: those set to `null`.
 * @property {string} packageUrl
 *   URL.
 * @property {ReadonlyArray<string>} packagedFiles
 *   Files that will be available after taking `.npmignore` and `"files"` into
 *   account.
 * @property {Node} tree
 *   JSONC tree.
 *
 * @typedef RawExport
 *   Export.
 * @property {ReadonlyArray<string> | undefined} conditions
 *   Conditions.
 * @property {boolean} exists
 *   Whether this file exists.
 * @property {string} filePath
 *   Raw path to file as used in export map.
 * @property {boolean} globbed
 *   Whether this file was added with a glob.
 * @property {ReadonlyArray<number | string>} jsonPath
 *   Path in `package.json`.
 * @property {ReadonlyArray<number>} jsonPathOrder
 *   Order of keys;
 *   this is like `jsonPath`,
 *   but with numbers for in which order keys occurred,
 *   which is needed because export maps are order-sensitive.
 * @property {string} specifier
 *   Specifier that exposes this.
 * @property {string} url
 *   Resolved URL to file.
 *
 * @typedef Result
 *   Result of finding exports.
 * @property {Array<Export>} exports
 *   Exports.
 * @property {VFile} file
 *   File.
 * @property {string | undefined} name
 *   Package name.
 */

import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import {fileURLToPath} from 'node:url'
import Arborist from '@npmcli/arborist'
import {name as isIdentifierName} from 'estree-util-is-identifier-name'
import {parseTree as jsonParse, findNodeAtLocation} from 'jsonc-parser'
import {Minimatch} from 'minimatch'
import npmPacklist from 'npm-packlist'
import {VFile} from 'vfile'
import {location} from 'vfile-location'
import {compareMessage} from 'vfile-sort'

const listFormat = new Intl.ListFormat('en')

/** @type {ReadonlyArray<string>} */
const mainDefaults = ['./index.js', './index.json', './index.node']

/** @type {ReadonlyArray<string>} */
const mainSuffixes = [
  '.js',
  '.json',
  '.node',
  '/index.js',
  '/index.json',
  '/index.node'
]

/** @type {ReadonlyArray<MutuallyExclusiveInfo>} */
const mutuallyExclusiveConditions = [
  // <https://nodejs.org/api/packages.html#community-conditions-definitions>
  {conditions: ['development', 'production'], exhaustive: false},
  // ESM vs CJS.
  // <https://nodejs.org/api/packages.html#community-conditions-definitions>
  {conditions: ['import', 'require'], exhaustive: true},
  // Regular Node vs C++.
  // <https://nodejs.org/api/packages.html#community-conditions-definitions>
  {conditions: ['node', 'node-addons'], exhaustive: false},
  {
    conditions: [
      // Generic browser environments.
      // <https://runtime-keys.proposal.wintercg.org/>
      'browser',
      // WinterGC runtime keys.
      'edge-routine', // Alibaba Cloud.
      'workerd', // Cloudflare.
      'deno', // Deno.
      'lagon', // Lagon Runtime.
      'react-native', // React native.
      'moddable', // Moddable SDK.
      'netlify', // Netlify Edge Functions.
      'electron', // Electron.
      'node', // Node.js.
      'bun', // Bun.
      'react-server', // React - Server Components.
      'edge-light', // Vercel - Edge Light
      'fastly' // Fastly - JavaScript on Compute@Edge
    ],
    exhaustive: false
  }
]

/**
 * Get the exports of a package.
 *
 * @param {Readonly<URL>} folder
 *   File URL to folder of a package.
 * @returns {Promise<Result>}
 *   Result.
 */
// eslint-disable-next-line complexity
export async function packageExports(folder) {
  const packageUrl = new URL('package.json', folder)
  const arborist = new Arborist({path: fileURLToPath(folder)})
  const arboristTree = await arborist.loadActual()
  const [packedFilesRaw, value] = await Promise.all([
    npmPacklist(arboristTree),
    fs.readFile(packageUrl, 'utf8')
  ])
  const file = new VFile({
    path: path.relative(process.cwd(), fileURLToPath(packageUrl)),
    value
  })
  const packageData = /** @type {PackageJson} */ (JSON.parse(value))
  const tree = jsonParse(value)
  const files = 'files' in packageData
  /** @type {string | undefined} */
  let name

  assert(tree)

  /** @type {State} */
  const state = {
    exports: [],
    file,
    location: location(file),
    negatedExports: [],
    packageUrl: packageUrl.href,
    packagedFiles: packedFilesRaw.map(pathToPosixPath),
    tree
  }

  if (typeof packageData.name === 'string') {
    name = packageData.name
  } else {
    message(
      state,
      'Unexpected missing `name` field, expected a package name',
      {ruleId: 'name-missing', source: 'package-exports'},
      []
    )
  }

  if (!packageData.type) {
    message(
      state,
      "Unexpected missing `type` field, expected `type: 'commonjs'` or `'module'`",
      {ruleId: 'type-missing', source: 'package-exports'},
      []
    )
  } else if (packageData.type !== 'commonjs' && packageData.type !== 'module') {
    message(
      state,
      'Unexpected invalid `type` value `' +
        packageData.type +
        '`, expected `commonjs` or `module`',
      {ruleId: 'type-invalid', source: 'package-exports'},
      ['type']
    )
  }

  if (!files) {
    message(
      state,
      'Unexpected missing `files` field, expected array of allowed files to include',
      {ruleId: 'files-missing', source: 'package-exports'},
      []
    )
  }

  if ('exports' in packageData) {
    await resolveExports(
      state,
      {
        conditions: undefined,
        path: ['exports'],
        pathOrder: [0],
        specifier: undefined
      },
      /** @type {unknown} */ (packageData.exports)
    )

    // Remove negated ones.
    for (const negated of state.negatedExports) {
      const asteriskIndex = negated.specifier.indexOf('*')
      const head =
        asteriskIndex === -1
          ? negated.specifier
          : negated.specifier.slice(0, asteriskIndex)
      const tail =
        asteriskIndex === -1
          ? undefined
          : negated.specifier.slice(asteriskIndex + 1)
      let found = false
      let index = -1

      while (++index < state.exports.length) {
        const export_ = state.exports[index]

        if (
          (tail === undefined
            ? export_.specifier === head
            : export_.specifier.startsWith(head) &&
              export_.specifier.endsWith(tail)) &&
          (export_.conditions && negated.conditions
            ? arrayEquivalent(export_.conditions, negated.conditions)
            : !export_.conditions && !negated.conditions)
        ) {
          found = true
          state.exports.splice(index, 1)
          index--
        }
      }

      // No matches, so useless.
      // Might also mean that things are available by default, but ignored in a
      // particular condition.
      if (!found) {
        message(
          state,
          'Unexpected negation specifier `' +
            negated.specifier +
            '` at `' +
            displayPath(negated.jsonPath) +
            '` with nothing to negate',
          {ruleId: 'exports-negated-missing', source: 'package-exports'},
          negated.jsonPath
        )
      }
    }

    // Check for a main specifier.
    if (
      !state.exports.some(function (d) {
        return d.specifier === '.'
      })
    ) {
      message(
        state,
        'Unexpected missing main specifier `.`, expected an export to the main module',
        {ruleId: 'exports-main-missing', source: 'package-exports'},
        []
      )
    }

    // Check for `"main"` field.
    if ('main' in packageData) {
      message(
        state,
        'Unexpected unused legacy `main` field with modern `exports`, remove it',
        {ruleId: 'main-extra', source: 'package-exports'},
        ['main']
      )
    }
  }

  if (!('exports' in packageData)) {
    await Promise.all([
      resolveMainExport(state, packageData.main, packageData.type),
      resolvePackagedFiles(state)
    ])
  }

  for (const export_ of state.exports) {
    if (export_.exists && !state.packagedFiles.includes(export_.filePath)) {
      message(
        state,
        'Unexpected file `' +
          export_.filePath +
          '` at `' +
          displayPath(export_.jsonPath) +
          '` which is excluded from the npm package, ' +
          (files
            ? 'add it to `files` in `package.json`'
            : 'remove it from `.npmignore`'),
        {ruleId: 'npm-ignored', source: 'package-exports'},
        export_.jsonPath
      )
    }
  }

  state.exports.sort(compareExport)
  file.messages.sort(compareMessage)

  return {exports: state.exports.map(rawExportToExport), file, name}
}

/**
 * Figure out which files are exposed and at which specifiers.
 *
 * @param {Readonly<State>} state
 * @param {Info} info
 * @param {unknown} exportsValue
 * @returns {Promise<undefined> | undefined}
 */
function resolveExports(state, info, exportsValue) {
  if (Array.isArray(exportsValue)) {
    return resolveExportsList(
      state,
      info,
      /** @type {ReadonlyArray<unknown>} */ (exportsValue)
    )
  }

  if (exportsValue && typeof exportsValue === 'object') {
    return resolveExportsObject(
      state,
      info,
      /** @type {Record<string, unknown>} */ (exportsValue)
    )
  }

  return addValue(state, info, exportsValue)
}

/**
 * Figure out which files are exposed and at which specifiers.
 *
 * @param {Readonly<State>} state
 * @param {Info} info
 * @param {ReadonlyArray<unknown>} exportsValue
 * @returns {Promise<undefined> | undefined}
 */
function resolveExportsList(state, info, exportsValue) {
  if (exportsValue.length === 0) {
    // Empty, which is useless.
    message(
      state,
      'Unexpected empty array at `' +
        displayPath(info.path) +
        '` doing nothing, expected a single item',
      {ruleId: 'exports-alternatives-empty', source: 'package-exports'},
      info.path
    )

    return
  }

  // Alternatives list.
  message(
    state,
    'Unexpected alternatives list at `' +
      displayPath(info.path) +
      '`, several tools don’t support this and pick the first item',
    {ruleId: 'exports-alternatives', source: 'package-exports'},
    info.path
  )

  return resolveExports(
    state,
    {
      conditions: info.conditions,
      path: [...info.path, 0],
      pathOrder: [...info.pathOrder, 0],
      specifier: info.specifier
    },
    exportsValue[0]
  )
}

/**
 * Figure out which files are exposed and at which specifiers.
 *
 * @param {Readonly<State>} state
 * @param {Info} info
 * @param {Record<string, unknown>} exportsValue
 * @returns {Promise<undefined> | undefined}
 */
function resolveExportsObject(state, info, exportsValue) {
  const keys = Object.keys(exportsValue)
  /** @type {boolean | undefined} */
  let dots
  let mixed = false

  for (const key of keys) {
    const dot = key.startsWith('.')
    if (dots === undefined) {
      dots = dot
    } else if (dots !== dot) {
      mixed = true
    }
  }

  // Empty, which is useless.
  if (dots === undefined) {
    message(
      state,
      'Unexpected empty object at `' +
        displayPath(info.path) +
        '` doing nothing, expected fields',
      {ruleId: 'exports-object-empty', source: 'package-exports'},
      info.path
    )

    return
  }

  // Mixed, which is invalid.
  if (mixed) {
    message(
      state,
      'Unexpected mixed specifiers (starting with `.`) and conditions (without `.`) at `' +
        displayPath(info.path) +
        '`, expected either specifiers or conditions',
      {ruleId: 'exports-object-mixed', source: 'package-exports'},
      info.path
    )

    return
  }

  // Specifiers, but invalid because nesting is nonsense.
  if (dots && info.specifier) {
    message(
      state,
      'Unexpected nested specifier' +
        (keys.length > 1 ? 's' : '') +
        ' ' +
        listFormat.format(
          keys.map(function (d) {
            return '`' + d + '`'
          })
        ) +
        ' at `' +
        displayPath(info.path) +
        '`, expected conditions',
      {ruleId: 'exports-specifier-nested', source: 'package-exports'},
      info.path
    )

    return
  }

  // Specifiers.
  return dots
    ? resolveExportsSpecifiers(state, info, exportsValue)
    : resolveExportsConditions(state, info, exportsValue)
}

/**
 * @param {Readonly<State>} state
 * @param {Info} info
 * @param {Readonly<Record<string, unknown>>} exportsValue
 * @returns {Promise<undefined>}
 */
// eslint-disable-next-line complexity
async function resolveExportsConditions(state, info, exportsValue) {
  const keys = Object.keys(exportsValue)
  /** @type {Array<Promise<undefined> | undefined>} */
  const tasks = []
  let hasDefault = false
  /** @type {string | undefined} */
  let last

  if (keys.length === 1 && keys[0] === 'default') {
    message(
      state,
      'Unexpected verbose conditions object with sole key `default` at `' +
        displayPath(info.path) +
        '`, replace the object with the value at `default`',
      {ruleId: 'exports-conditions-verbose', source: 'package-exports'},
      info.path
    )
  }

  // `(.+).cjs` → `$1.d.cts`
  // `(.+).js`→`$1.d.ts`
  // `(.+).mjs` → `$1.d.mts`
  if (
    keys.includes('default') &&
    keys.includes('types') &&
    typeof exportsValue.default === 'string' &&
    typeof exportsValue.types === 'string'
  ) {
    const parts = exportsValue.default.split('.')
    const extname = parts.pop()

    if (
      (extname === 'js' || extname === 'cjs' || extname === 'mjs') &&
      exportsValue.types ===
        [...parts, 'd', extname.replace('j', 't')].join('.')
    ) {
      message(
        state,
        'Unexpected verbose `types` condition at `' +
          displayPath(info.path) +
          '` matching what TypeScript would load for `default` without it, remove it',
        {ruleId: 'exports-types-verbose', source: 'package-exports'},
        [...info.path, 'types']
      )
    }
  }

  let index = 0

  for (const condition of keys) {
    for (const exclusive of mutuallyExclusiveConditions) {
      if (!info.conditions || !exclusive.conditions.includes(condition)) {
        continue
      }

      for (const other of info.conditions) {
        if (!exclusive.conditions.includes(other)) {
          continue
        }

        message(
          state,
          'Unexpected condition `' +
            condition +
            '` mutually exclusive with `' +
            other +
            '` at `' +
            displayPath(info.path) +
            '` which never matches, use only one of these conditions',
          {
            ruleId: 'exports-conditions-mutually-exclusive',
            source: 'package-exports'
          },
          [...info.path, condition]
        )

        // No need to warn multiple times.
        break
      }
    }

    tasks.push(
      resolveExports(
        state,
        {
          conditions: info.conditions
            ? [...info.conditions, condition]
            : [condition],
          path: [...info.path, condition],
          pathOrder: [...info.pathOrder, index],
          specifier: info.specifier
        },
        exportsValue[condition]
      )
    )

    if (condition === 'default') hasDefault = true
    last = condition

    index++
  }

  assert(last)

  let exhaustive = false

  for (const exclusive of mutuallyExclusiveConditions) {
    if (
      exclusive.exhaustive &&
      // No `default` is needed if `require` and `import` are used.
      // It could be theoretically useful for tools that don’t load JS?
      // So we don’t require it but we do allow it.
      exclusive.conditions.every(function (d) {
        return keys.includes(d)
      })
    ) {
      exhaustive = true
      break
    }
  }

  if (hasDefault) {
    if (last !== 'default') {
      message(
        state,
        'Unexpected non-last `default` conditions at `' +
          displayPath(info.path) +
          '` ignoring everything after it, move the `default` condition to the end',
        {
          ruleId: 'exports-conditions-default-misplaced',
          source: 'package-exports'
        },
        [...info.path, last]
      )
    }
  } else if (!exhaustive) {
    message(
      state,
      'Unexpected conditions without a `default` entry at `' +
        displayPath(info.path) +
        '` making specifier `' +
        (info.specifier || '.') +
        "` unusable by default, expected `'default'` condition as the last field",
      {ruleId: 'exports-conditions-default-missing', source: 'package-exports'},
      info.path
    )
  }

  await Promise.all(tasks)
}

/**
 * @param {Readonly<State>} state
 * @param {Info} info
 * @param {Readonly<Record<string, unknown>>} exportsValue
 * @returns {Promise<undefined>}
 */
async function resolveExportsSpecifiers(state, info, exportsValue) {
  const keys = Object.keys(exportsValue)
  /** @type {Array<Promise<undefined> | undefined>} */
  const tasks = []

  if (keys.length === 1 && keys[0] === '.') {
    message(
      state,
      'Unexpected verbose specifier object with sole key `.` at `' +
        displayPath(info.path) +
        '`, replace the object with the value at `.`',
      {ruleId: 'exports-specifiers-verbose', source: 'package-exports'},
      info.path
    )
  }

  let index = 0

  for (const specifier of keys) {
    // Warn for extensions.
    const parts = specifier.split('.')
    const extension = parts.pop()

    if (extension && !extension.includes('/')) {
      const rest = parts.join('.')
      message(
        state,
        'Unexpected extension `.' +
          extension +
          '` in specifier `' +
          specifier +
          '` at `' +
          displayPath(info.path) +
          '`, extensions have no meaning in specifiers' +
          (keys.includes(rest) ? ', remove it' : ', expected `' + rest + '`'),
        {ruleId: 'exports-specifier-extension', source: 'package-exports'},
        info.path
      )
    }

    tasks.push(
      resolveExports(
        state,
        {
          conditions: info.conditions,
          path: [...info.path, specifier],
          pathOrder: [...info.pathOrder, index],
          specifier
        },
        exportsValue[specifier]
      )
    )

    index++
  }

  await Promise.all(tasks)
}

/**
 * Figure out which files are exposed and at which specifiers.
 *
 * @param {Readonly<State>} state
 * @param {Info} info
 * @param {unknown} exportsValue
 * @returns {Promise<undefined> | undefined}
 */
function addValue(state, info, exportsValue) {
  if (exportsValue !== null && typeof exportsValue !== 'string') {
    message(
      state,
      'Unexpected invalid value `' +
        // We’re parsing JSON so `JSON.stringify` should never fail.
        JSON.stringify(exportsValue) +
        '` at `' +
        displayPath(info.path) +
        '` which is not importable, expected ' +
        (info.specifier ? '' : 'specifier object, ') +
        'conditions object, `string` (path to file), or `null` (negated)',
      {ruleId: 'exports-value-invalid', source: 'package-exports'},
      info.path
    )
    return
  }

  if (typeof exportsValue === 'string' && !exportsValue.startsWith('./')) {
    message(
      state,
      "Unexpected unprefixed value `'" +
        exportsValue +
        "'` at `" +
        displayPath(info.path) +
        "` which is not importable, did you mean `'./" +
        exportsValue +
        "'`",
      {ruleId: 'exports-path-unprefixed', source: 'package-exports'},
      info.path
    )
    return
  }

  const specifier = info.specifier || '.'
  const specifierAsterisk = specifier.indexOf('*')

  if (
    // Negation: `./x/*: null`.
    exportsValue === null ||
    // Static: `./example`.
    specifierAsterisk === -1
  ) {
    return addResolved(
      state,
      {...info, definitelyExists: false, explicitlyDefined: true},
      specifier,
      exportsValue
    )
  }

  // Incorrect: `./*/x/*`
  if (specifier.includes('*', specifierAsterisk + 1)) {
    message(
      state,
      'Unexpected extra wildcard in dynamic specifier `' +
        specifier +
        '` at `' +
        displayPath(info.path) +
        '`, one wildcard is allowed',
      {ruleId: 'exports-specifier-wildcard-invalid', source: 'package-exports'},
      info.path
    )

    return
  }

  const valueAsterisk = exportsValue.indexOf('*')

  // Useless. `'./*': './index.js'`
  if (valueAsterisk === -1) {
    message(
      state,
      'Unexpected dynamic specifier `' +
        specifier +
        '` pointing to static file `' +
        exportsValue +
        '` at `' +
        displayPath(info.path) +
        '`, use dynamic specifiers with dynamic file globs',
      {ruleId: 'exports-specifier-wildcard-useless', source: 'package-exports'},
      info.path
    )

    // But still valid.
    // Anything could match, so we recommend using the asterisk.
    return addResolved(
      state,
      {...info, definitelyExists: false, explicitlyDefined: true},
      specifier,
      exportsValue
    )
  }

  return addDynamic(
    state,
    info,
    [
      specifier.slice(0, specifierAsterisk),
      specifier.slice(specifierAsterisk + 1)
    ],
    exportsValue.split('*')
  )
}

/**
 * @param {State} state
 * @param {unknown} main
 * @param {unknown} type
 * @returns {Promise<undefined>}
 */
async function resolveMainExport(state, main, type) {
  let warned = false
  /** @type {string | undefined} */
  let mainFound

  if (main === undefined) {
    // Fine.
  }
  // Defined.
  else if (typeof main === 'string') {
    const normal = main.startsWith('./') ? main : './' + main

    // Explicit resolved `main`.
    if (state.packagedFiles.includes(normal)) {
      mainFound = normal
      message(
        state,
        'Unexpected legacy `main` field that does not encapsulate the package, it’s recommended to use an export map such as `"exports": "' +
          mainFound +
          '"`',
        {ruleId: 'main', source: 'package-exports'},
        ['main']
      )
    }
    // Explicit resolving `main`.
    else {
      for (const suffix of mainSuffixes) {
        const option = normal + suffix
        if (state.packagedFiles.includes(option)) {
          mainFound = option
          break
        }
      }

      if (mainFound) {
        if (type === 'module') {
          message(
            state,
            'Unexpected `main` field `' +
              main +
              '` that does not resolve with `type: \'module\'`, use an export map such as `"exports": "' +
              mainFound +
              '"`',
            {ruleId: 'main-resolve-module', source: 'package-exports'},
            ['main']
          )
          // It doesn’t work in ESM, we just resolved it for a better error.
          mainFound = undefined
          // But we don’t need another warning.
          warned = true
        } else {
          message(
            state,
            'Unexpected `main` field `' +
              main +
              '` that resolves to `' +
              mainFound +
              "` in CJS, this works but is slow and doesn’t work with `type: 'module', use the resolved value explicitly",
            {ruleId: 'main-resolve-commonjs', source: 'package-exports'},
            ['main']
          )
        }
      } else {
        message(
          state,
          'Unexpected missing file for `main` field `' + main + '`',
          {ruleId: 'main-not-found', source: 'package-exports'},
          ['main']
        )
        // But we don’t need another warning.
        warned = true
      }
    }
  }
  // Invalid.
  else {
    message(
      state,
      'Unexpected non-string `main` field `' + main + '`',
      {ruleId: 'main-invalid', source: 'package-exports'},
      ['main']
    )
    // But we don’t need another warning.
    warned = true
  }

  if (mainFound) {
    return addResolved(
      state,
      {
        conditions: undefined,
        definitelyExists: true,
        explicitlyDefined: true,
        path: ['main'],
        pathOrder: [0],
        specifier: undefined
      },
      '.',
      mainFound
    )
  }

  // Not yet found? Try main files.
  for (const option of mainDefaults) {
    if (state.packagedFiles.includes(option)) {
      mainFound = option
      break
    }
  }

  if (mainFound) {
    message(
      state,
      'Unexpected inferred main export `' +
        mainFound +
        '`, it’s recommended to use an export map such as `"exports": "' +
        mainFound +
        '"`',
      {ruleId: 'main-inferred', source: 'package-exports'},
      []
    )

    return addResolved(
      state,
      {
        conditions: undefined,
        definitelyExists: true,
        explicitlyDefined: false,
        path: [],
        pathOrder: [],
        specifier: undefined
      },
      '.',
      mainFound
    )
  }

  if (!warned) {
    message(
      state,
      'Unexpected missing main module, it’s recommended to use an export map such as `"exports": "./index.js"`',
      {ruleId: 'main-missing', source: 'package-exports'},
      []
    )
  }
}

/**
 * @param {State} state
 * @returns {Promise<undefined>}
 */
async function resolvePackagedFiles(state) {
  /** @type {Array<Promise<undefined> | undefined>} */
  const tasks = []

  for (const file of state.packagedFiles) {
    tasks.push(
      addResolved(
        state,
        {
          conditions: undefined,
          definitelyExists: true,
          explicitlyDefined: false,
          path: [],
          pathOrder: [],
          specifier: file
        },
        file,
        file
      )
    )
  }

  await Promise.all(tasks)
}

/**
 *
 * @param {State} state
 * @param {Info} info
 * @param {[before: string, after: string]} specifier
 * @param {Array<string>} valueParts
 * @returns {Promise<undefined>}
 */
async function addDynamic(state, info, specifier, valueParts) {
  const minmatch = new Minimatch(valueParts.join('**/*'), {
    dot: true,
    nobrace: true,
    noext: true
  })

  const results = state.packagedFiles.filter(function (d) {
    return minmatch.match(d)
  })

  if (results.length === 0) {
    message(
      state,
      'Unexpected dynamic file glob `' +
        valueParts.join('*') +
        '` at `' +
        displayPath(info.path) +
        '` pointing to nothing, expected files',
      {ruleId: 'exports-path-wildcard-not-found', source: 'package-exports'},
      info.path
    )

    return
  }

  const replacements = findWildcardReplacements(valueParts, results)
  /** @type {Array<Promise<undefined> | undefined>} */
  const tasks = []

  for (const replacement of replacements) {
    tasks.push(
      addResolved(
        state,
        {...info, definitelyExists: true, explicitlyDefined: false},
        specifier[0] + replacement + specifier[1],
        valueParts.join(replacement)
      )
    )
  }

  await Promise.all(tasks)
}

/**
 *
 * @param {State} state
 * @param {AddInfo} info
 * @param {string} specifier
 * @param {string | null} value
 * @returns {Promise<undefined> | undefined}
 */
function addResolved(state, info, specifier, value) {
  if (value === null) {
    state.negatedExports.push({
      conditions: info.conditions,
      jsonPath: [...info.path],
      jsonPathOrder: [...info.pathOrder],
      specifier
    })
    return
  }

  /** @type {RawExport} */
  const export_ = {
    conditions: info.conditions,
    exists: false,
    filePath: value,
    globbed: !info.explicitlyDefined,
    jsonPath: [...info.path],
    jsonPathOrder: [...info.pathOrder],
    specifier,
    url: new URL(value, state.packageUrl).href
  }

  state.exports.push(export_)

  if (info.definitelyExists || state.packagedFiles.includes(value)) {
    export_.exists = true
    return
  }

  return checkExists(state, export_)
}

/**
 *
 * @param {State} state
 * @param {RawExport} export_
 * @returns {Promise<undefined>}
 */
async function checkExists(state, export_) {
  try {
    await fs.access(new URL(export_.url), fs.constants.F_OK)
    export_.exists = true
  } catch (error) {
    export_.exists = false
    const cause = /** @type {NodeJS.ErrnoException} */ (error)
    message(
      state,
      'Unexpected missing file `' +
        export_.filePath +
        '` for specifier `' +
        export_.specifier +
        '` at `' +
        displayPath(export_.jsonPath) +
        '`',
      {cause, ruleId: 'exports-path-not-found', source: 'package-exports'},
      export_.jsonPath
    )
  }
}

/**
 * So we found a bunch of files on the file system (`filePaths`).
 * Each from a glob with one or more asterisks (`parts`), which could match
 * anything.
 * On the input side though, only one asterisk is used so each part needs to
 * be the same.
 * Now resolve which value that is.
 *
 * @param {ReadonlyArray<string>} parts
 * @param {ReadonlyArray<string>} filePaths
 * @returns {Array<string>}
 */
function findWildcardReplacements(parts, filePaths) {
  /** @type {Array<string>} */
  const results = []

  for (const filePath of filePaths) {
    const first = parts[0]
    const second = parts[1]
    assert(first !== undefined)
    assert(filePath.slice(0, first.length) === first)
    assert(second !== undefined)
    /** @type {Array<string>} */
    const options = []
    const start = first.length

    if (second !== '') {
      let maybeEnd = filePath.indexOf(second, start)
      while (maybeEnd !== -1) {
        options.push(filePath.slice(start, maybeEnd))
        maybeEnd = filePath.indexOf(second, maybeEnd + 1)
      }
    }

    options.push(filePath.slice(start))

    for (const option of options) {
      if (parts.join(option) === filePath) {
        results.push(option)
        break
      }
    }
  }

  return results
}

/**
 * Emit a message.
 *
 * @param {Readonly<State>} state
 * @param {string} reason
 * @param {Options} options
 * @param {ReadonlyArray<number | string>} jsonPath
 */
function message(state, reason, options, jsonPath) {
  const node =
    jsonPath.length > 0
      ? findNodeAtLocation(state.tree, [...jsonPath])
      : state.tree

  assert(node)
  const start = state.location.toPoint(node.offset)
  const end = state.location.toPoint(node.offset + node.length)
  assert(start)
  assert(end)
  const place = {start, end}

  state.file.message(reason, {place, ...options})
}

/**
 * Display a JSON path.
 *
 * @param {ReadonlyArray<number | string>} segments
 * @returns {string}
 */
function displayPath(segments) {
  let value = ''
  let index = -1

  while (++index < segments.length) {
    const segment = segments[index]
    value +=
      typeof segment === 'number'
        ? '[' + segment + ']'
        : isIdentifierName(segment)
          ? (value ? '.' : '') + segment
          : "['" + segment.replaceAll(/['\\]/g, '\\$0') + "']"
  }

  return value
}

/**
 * Compare exports.
 *
 * @param {RawExport} left
 *   Left.
 * @param {RawExport} right
 *   Right.
 * @returns {number}
 *   Order.
 */
function compareExport(left, right) {
  const length = Math.max(left.jsonPathOrder.length, right.jsonPathOrder.length)
  let index = -1

  // Sort in the order things were found in the export map.
  while (++index < length) {
    const difference =
      (left.jsonPathOrder[index] || 0) - (right.jsonPathOrder[index] || 0)
    if (difference) return difference
  }

  // Sort when a glob was used, alphabetuically.
  return (
    left.specifier.split('/').length - right.specifier.split('/').length ||
    left.specifier.localeCompare(right.specifier)
  )
}

/**
 * Check if two sets contain the same values.
 *
 * @param {ReadonlyArray<unknown>} left
 * @param {ReadonlyArray<unknown>} right
 * @returns {boolean}
 */
function arrayEquivalent(left, right) {
  return left.length === right.length && left.every(has)

  /**
   * @param {unknown} value
   * @returns {boolean}
   */
  function has(value) {
    return right.includes(value)
  }
}

/**
 * @param {string} value
 * @returns {string}
 */
function pathToPosixPath(value) {
  return './' + value.split(path.sep).join('/')
}

/**
 * @param {RawExport} raw
 *   Raw export.
 * @returns {Export}
 *   Clean export.
 */
function rawExportToExport(raw) {
  const {filePath, globbed, jsonPathOrder, ...rest} = raw
  return rest
}
