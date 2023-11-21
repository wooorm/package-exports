# package-exports

[![Build][badge-build-image]][badge-build-url]
[![Coverage][badge-coverage-image]][badge-coverage-url]
[![Downloads][badge-downloads-image]][badge-downloads-url]

Get the exports of a package.

## Contents

* [What is this?](#what-is-this)
* [When should I use this?](#when-should-i-use-this)
* [Install](#install)
* [Use](#use)
* [API](#api)
  * [`packageExports(folder)`](#packageexportsfolder)
  * [`Export`](#export)
  * [`Result`](#result)
* [Errors](#errors)
  * [`exports-alternatives`](#exports-alternatives)
  * [`exports-alternatives-empty`](#exports-alternatives-empty)
  * [`exports-conditions-default-misplaced`](#exports-conditions-default-misplaced)
  * [`exports-conditions-default-missing`](#exports-conditions-default-missing)
  * [`exports-conditions-mutually-exclusive`](#exports-conditions-mutually-exclusive)
  * [`exports-conditions-verbose`](#exports-conditions-verbose)
  * [`exports-main-missing`](#exports-main-missing)
  * [`exports-negated-missing`](#exports-negated-missing)
  * [`exports-object-empty`](#exports-object-empty)
  * [`exports-object-mixed`](#exports-object-mixed)
  * [`exports-path-not-found`](#exports-path-not-found)
  * [`exports-path-unprefixed`](#exports-path-unprefixed)
  * [`exports-path-wildcard-not-found`](#exports-path-wildcard-not-found)
  * [`exports-specifier-extension`](#exports-specifier-extension)
  * [`exports-specifier-nested`](#exports-specifier-nested)
  * [`exports-specifier-wildcard-invalid`](#exports-specifier-wildcard-invalid)
  * [`exports-specifier-wildcard-useless`](#exports-specifier-wildcard-useless)
  * [`exports-specifiers-verbose`](#exports-specifiers-verbose)
  * [`exports-types-verbose`](#exports-types-verbose)
  * [`exports-value-invalid`](#exports-value-invalid)
  * [`files-missing`](#files-missing)
  * [`main`](#main)
  * [`main-extra`](#main-extra)
  * [`main-inferred`](#main-inferred)
  * [`main-invalid`](#main-invalid)
  * [`main-missing`](#main-missing)
  * [`main-not-found`](#main-not-found)
  * [`main-resolve-commonjs`](#main-resolve-commonjs)
  * [`main-resolve-module`](#main-resolve-module)
  * [`name-missing`](#name-missing)
  * [`npm-ignored`](#npm-ignored)
  * [`type-invalid`](#type-invalid)
  * [`type-missing`](#type-missing)
* [Compatibility](#compatibility)
* [Security](#security)
* [Contribute](#contribute)
* [License](#license)

## What is this?

This package find out what is exposed from a package.
It also emits many possible warnings about potential problems.

## When should I use this?

You can use this to programatically figure out what can be used from a package.
You can also use this to lint packages.

## Install

This package is [ESM only][github-gist-esm].
In Node.js (version 18+), install with [npm][npm-install]:

```sh
npm install package-exports
```

## Use

```js
import {packageExports} from 'package-exports'
import {reporter} from 'vfile-reporter'

const thisPackage = await packageExports(new URL('.', import.meta.url))

console.dir(thisPackage, {depth: undefined})

const tar = await packageExports(new URL('node_modules/tar/', import.meta.url))
console.error(reporter(tar.file))
```

Yields:

```js
{
  exports: [
    {
      conditions: undefined,
      exists: true,
      jsonPath: [ 'exports' ],
      specifier: '.',
      url: 'file:///Users/…/package-exports/index.js'
    }
  ],
  file: VFile { … },
  name: 'package-exports'
}
```

```txt
node_modules/tar/package.json
1:1-70:2 warning Unexpected inferred main export `./index.js`, it’s recommended to use an export map such as `"exports": "./index.js"` main-inferred package-exports
1:1-70:2 warning Unexpected missing `type` field, expected `type: 'commonjs'` or `'module'`                                            type-missing  package-exports

⚠ 2 warnings
```

## API

This package exports the identifier
[`packageExports`][api-package-exports].
It exports the [TypeScript][] types
[`Export`][api-export] and
[`Result`][api-result].
There is no default export.

### `packageExports(folder)`

Get the exports of a package.

###### Parameters

* `folder` (`URL`, required)
  — file URL to folder of a package

###### Returns

Result ([`Promise<Result>`][api-result]).

### `Export`

Export (TypeScript type).

###### Fields

* `conditions` (`Array<string>`)
  — conditions
* `exists` (`boolean`)
  — whether this file exists
* `jsonPath` (`Array<number | string>`)
  — path in `package.json`
* `specifier` (`string`)
  — specifier that exposes this
* `url` (`URL`)
  — resolved URL to file

### `Result`

Result of finding exports (TypeScript type).

###### Fields

* `exports` ([`Array<Exports>`][api-export])
  — exports
* `file` ([`VFile`][github-vfile])
  – file
* `name` (`string` or `undefined`)
  – package name

## Errors

This package lints for many problems in npm packages and adds each message to
the [vfile][github-vfile].
Messages will have a `source` field set to `package-exports` and a `ruleId`
to one of the following values.

### `exports-alternatives`

`package.json`:

```json
{
  "exports": {
    ".": "./index.js",
    "./other": [
      "./other.js"
    ]
  },
  "files": [
    "index.js",
    "other.js"
  ],
  "name": "x",
  "type": "module"
}
```

Yields:

```txt
4:16-6:6: Unexpected alternatives list at `exports['./other']`, several tools don’t support this and pick the first item
```

Fix:

```diff
@@ -1,7 +1,7 @@
 {
   "exports": {
     ".": "./index.js",
-    "./other": ["./other.js"]
+    "./other": "./other.js"
   },
   "files": ["index.js", "other.js"],
   "name": "x",
```

### `exports-alternatives-empty`

`package.json`:

```json
{
  "exports": {
    ".": "./index.js",
    "./other": []
  },
  "files": [
    "index.js"
  ],
  "name": "x",
  "type": "module"
}
```

Yields:

```txt
4:16-4:18: Unexpected empty array at `exports['./other']` doing nothing, expected a single item
```

Fix:

```diff
@@ -1,7 +1,6 @@
 {
   "exports": {
-    ".": "./index.js",
-    "./other": []
+    ".": "./index.js"
   },
   "files": ["index.js"],
   "name": "x",
```

### `exports-conditions-default-misplaced`

`package.json`:

```json
{
  "exports": {
    "default": "./index.js",
    "production": "./other.js"
  },
  "files": [
    "index.js",
    "other.js"
  ],
  "name": "x",
  "type": "module"
}
```

Yields:

```txt
4:19-4:31: Unexpected non-last `default` conditions at `exports` ignoring everything after it, move the `default` condition to the end
```

Fix:

```diff
@@ -1,7 +1,7 @@
 {
   "exports": {
-    "default": "./index.js",
-    "production": "./other.js"
+    "production": "./other.js",
+    "default": "./index.js"
   },
   "files": ["index.js", "other.js"],
   "name": "x",
```

### `exports-conditions-default-missing`

`package.json`:

```json
{
  "exports": {
    "production": "./index.js"
  },
  "files": [
    "index.js"
  ],
  "name": "x",
  "type": "module"
}
```

Yields:

```txt
2:14-4:4: Unexpected conditions without a `default` entry at `exports` making specifier `.` unusable by default, expected `'default'` condition as the last field
```

Fix:

```diff
@@ -1,6 +1,7 @@
 {
   "exports": {
-    "production": "./index.js"
+    "production": "./index.js",
+    "default": "./other.js"
   },
   "files": [
     "index.js"
```

### `exports-conditions-mutually-exclusive`

`package.json`:

```json
{
  "exports": {
    "import": {
      "require": "./other.js",
      "default": "./index.js"
    },
    "default": "./index.js"
  },
  "files": [
    "index.js",
    "other.js"
  ],
  "name": "x",
  "type": "module"
}
```

Yields:

```txt
4:18-4:30: Unexpected condition `require` mutually exclusive with `import` at `exports.import` which never matches, use only one of these conditions
```

Fix:

```diff
@@ -1,10 +1,7 @@
 {
   "exports": {
-    "import": {
-      "require": "./other.js",
-      "default": "./index.js"
-    },
-    "default": "./index.js"
+    "require": "./other.js",
+    "import": "./index.js"
   },
   "files": [
     "index.js",
```

### `exports-conditions-verbose`

`package.json`:

```json
{
  "exports": {
    "default": "./index.js"
  },
  "files": [
    "index.js"
  ],
  "name": "x",
  "type": "module"
}
```

Yields:

```txt
2:14-4:4: Unexpected verbose conditions object with sole key `default` at `exports`, replace the object with the value at `default`
```

Fix:

```diff
@@ -1,7 +1,5 @@
 {
-  "exports": {
-    "default": "./index.js"
-  },
+  "exports": "./index.js",
   "files": [
     "index.js"
   ],
```

### `exports-main-missing`

`package.json`:

```json
{
  "exports": {
    "./x": "./index.js"
  },
  "files": [
    "index.js"
  ],
  "name": "x",
  "type": "module"
}
```

Yields:

```txt
1:1-10:2: Unexpected missing main specifier `.`, expected an export to the main module
```

Fix:

```diff
@@ -1,5 +1,6 @@
 {
   "exports": {
+    ".": "./index.js",
     "./x": "./index.js"
   },
   "files": [
```

### `exports-negated-missing`

`package.json`:

```json
{
  "exports": {
    ".": "./index.js",
    "./*": null
  },
  "files": [
    "index.js"
  ],
  "name": "x",
  "type": "module"
}
```

Yields:

```txt
4:12-4:16: Unexpected negation specifier `./*` at `exports['./*']` with nothing to negate
```

Fix:

```diff
@@ -1,6 +1,7 @@
 {
   "exports": {
     ".": "./index.js",
+    "./x": "./index.js",
     "./*": null
   },
   "files": [
```

### `exports-object-empty`

`package.json`:

```json
{
  "exports": {
    ".": "./index.js",
    "./other": {}
  },
  "files": [
    "index.js"
  ],
  "name": "x",
  "type": "module"
}
```

Yields:

```txt
4:16-4:18: Unexpected empty object at `exports['./other']` doing nothing, expected fields
```

Fix:

```diff
@@ -1,7 +1,6 @@
 {
   "exports": {
-    ".": "./index.js",
-    "./other": {}
+    ".": "./index.js"
   },
   "files": [
     "index.js"
```

### `exports-object-mixed`

`package.json`:

```json
{
  "exports": {
    ".": "./index.js",
    "default": "./other.js"
  },
  "files": [
    "index.js",
    "other.js"
  ],
  "name": "x",
  "type": "module"
}
```

Yields:

```txt
1:1-12:2: Unexpected missing main specifier `.`, expected an export to the main module
2:14-5:4: Unexpected mixed specifiers (starting with `.`) and conditions (without `.`) at `exports`, expected either specifiers or conditions
```

Fix:

```diff
@@ -1,6 +1,6 @@
 {
   "exports": {
-    ".": "./index.js",
+    "other": "./index.js",
     "default": "./other.js"
   },
   "files": [
```

### `exports-path-not-found`

`package.json`:

```json
{
  "exports": {
    ".": "./index.js",
    "./x": "./missing.js"
  },
  "files": [
    "index.js",
    "missing.js"
  ],
  "name": "x",
  "type": "module"
}
```

Yields:

```txt
4:12-4:26: Unexpected missing file `./missing.js` for specifier `./x` at `exports['./x']`
```

Fix: make sure files exist.

### `exports-path-unprefixed`

`package.json`:

```json
{
  "exports": "index.js",
  "files": [
    "index.js"
  ],
  "name": "x",
  "type": "module"
}
```

Yields:

```txt
1:1-8:2: Unexpected missing main specifier `.`, expected an export to the main module
2:14-2:24: Unexpected unprefixed value `'index.js'` at `exports` which is not importable, did you mean `'./index.js'`
```

Fix:

```diff
@@ -1,5 +1,5 @@
 {
-  "exports": "index.js",
+  "exports": "./index.js",
   "files": [
     "index.js"
   ],
```

### `exports-path-wildcard-not-found`

`package.json`:

```json
{
  "exports": {
    ".": "./index.js",
    "./*": "./lib/*"
  },
  "files": [
    "lib/",
    "index.js"
  ],
  "name": "x",
  "type": "module"
}
```

Yields:

```txt
4:12-4:21: Unexpected dynamic file glob `./lib/*` at `exports['./*']` pointing to nothing, expected files
```

Fix: make sure files exist.

### `exports-specifier-extension`

`package.json`:

```json
{
  "exports": {
    ".": "./index.js",
    "./other.js": "./other.js"
  },
  "files": [
    "index.js",
    "other.js"
  ],
  "name": "x",
  "type": "module"
}
```

Yields:

```txt
2:14-5:4: Unexpected extension `.js` in specifier `./other.js` at `exports`, extensions have no meaning in specifiers, expected `./other`
```

Fix:

```diff
@@ -1,7 +1,7 @@
 {
   "exports": {
     ".": "./index.js",
-    "./other.js": "./other.js"
+    "./other": "./other.js"
   },
   "files": [
     "index.js",
```

### `exports-specifier-nested`

`package.json`:

```json
{
  "exports": {
    ".": "./index.js",
    "./other": {
      "./more": "./other.js"
    }
  },
  "files": [
    "index.js",
    "other.js"
  ],
  "name": "x",
  "type": "module"
}
```

Yields:

```txt
4:16-6:6: Unexpected nested specifier `./more` at `exports['./other']`, expected conditions
```

Fix:

```diff
@@ -1,9 +1,7 @@
 {
   "exports": {
     ".": "./index.js",
-    "./other": {
-      "./more": "./other.js"
-    }
+    "./other/more": "./other.js"
   },
   "files": [
     "index.js",
```

### `exports-specifier-wildcard-invalid`

`package.json`:

```json
{
  "exports": {
    ".": "./index.js",
    "./x/*/y/*": "./other.js"
  },
  "files": [
    "index.js",
    "other.js"
  ],
  "name": "x",
  "type": "module"
}
```

Yields:

```txt
4:18-4:30: Unexpected extra wildcard in dynamic specifier `./x/*/y/*` at `exports['./x/*/y/*']`, one wildcard is allowed
```

Fix:

```diff
@@ -1,7 +1,7 @@
 {
   "exports": {
     ".": "./index.js",
-    "./x/*/y/*": "./other.js"
+    "./x/*/y": "./other.js"
   },
   "files": [
     "index.js",
```

### `exports-specifier-wildcard-useless`

`package.json`:

```json
{
  "exports": {
    ".": "./index.js",
    "./*": "./other.js"
  },
  "files": [
    "index.js",
    "other.js"
  ],
  "name": "x",
  "type": "module"
}
```

Yields:

```txt
4:12-4:24: Unexpected dynamic specifier `./*` pointing to static file `./other.js` at `exports['./*']`, use dynamic specifiers with dynamic file globs
```

Fix:

```diff
@@ -1,7 +1,7 @@
 {
   "exports": {
     ".": "./index.js",
-    "./*": "./other.js"
+    "./other": "./other.js"
   },
   "files": [
     "index.js",
```

### `exports-specifiers-verbose`

`package.json`:

```json
{
  "exports": {
    ".": "./index.js"
  },
  "files": [
    "index.js"
  ],
  "name": "x",
  "type": "module"
}
```

Yields:

```txt
2:14-4:4: Unexpected verbose specifier object with sole key `.` at `exports`, replace the object with the value at `.`
```

Fix:

```diff
@@ -1,7 +1,5 @@
 {
-  "exports": {
-    ".": "./index.js"
-  },
+  "exports": "./index.js",
   "files": [
     "index.js"
   ],
```

### `exports-types-verbose`

`package.json`:

```json
{
  "exports": {
    "types": "./index.d.ts",
    "default": "./index.js"
  },
  "files": [
    "index.d.ts",
    "index.js"
  ],
  "name": "x",
  "type": "module"
}
```

Yields:

```txt
3:14-3:28: Unexpected verbose `types` condition at `exports` matching what TypeScript would load for `default` without it, remove it
```

Fix:

```diff
@@ -1,8 +1,5 @@
 {
-  "exports": {
-    "types": "./index.d.ts",
-    "default": "./index.js"
-  },
+  "exports": "./index.js",
   "files": [
     "index.d.ts",
     "index.js"
```

### `exports-value-invalid`

`package.json`:

```json
{
  "exports": {
    ".": "./index.js",
    "./other": 1
  },
  "files": [
    "index.js"
  ],
  "name": "x",
  "type": "module"
}
```

Yields:

```txt
4:16-4:17: Unexpected invalid value `1` at `exports['./other']` which is not importable, expected conditions object, `string` (path to file), or `null` (negated)
```

Fix:

```diff
+++ b/example/package.json
@@ -1,7 +1,7 @@
 {
   "exports": {
     ".": "./index.js",
-    "./other": 1
+    "./other": "./other.js"
   },
   "files": [
     "index.js"
```

### `files-missing`

`package.json`:

```json
{
  "exports": "./index.js",
  "name": "x",
  "type": "module",
}
```

Yields:

```txt
1:1-5:2: Unexpected missing `files` field, expected array of allowed files to include
```

Fix:

```diff
@@ -1,5 +1,8 @@
 {
   "exports": "./index.js",
+  "files": [
+    "index.js"
+  ],
   "name": "x",
   "type": "module"
 }
```

### `main`

`package.json`:

```json
{
  "files": [
    "index.js",
    "other.js"
  ],
  "main": "index.js",
  "name": "x",
  "type": "module"
}
```

Yields:

```txt
6:11-6:21: Unexpected legacy `main` field that does not encapsulate the package, it’s recommended to use an export map such as `"exports": "./index.js"`
```

Fix:

```diff
@@ -1,9 +1,9 @@
 {
+  "exports": "./index.js",
   "files": [
     "index.js",
     "other.js"
   ],
-  "main": "index.js",
   "name": "x",
   "type": "module"
 }
```

### `main-extra`

`package.json`:

```json
{
  "exports": "./index.js",
  "files": [
    "index.js"
  ],
  "main": "index.js",
  "name": "x",
  "type": "module"
}
```

Yields:

```txt
6:11-6:21: Unexpected unused legacy `main` field with modern `exports`, remove it
```

Fix:

```diff
@@ -3,7 +3,6 @@
   "files": [
     "index.js"
   ],
-  "main": "index.js",
   "name": "x",
   "type": "module"
 }
```

### `main-inferred`

`package.json`:

```json
{
  "files": [
    "index.js"
  ],
  "name": "x",
  "type": "commonjs"
}
```

Yields:

```txt
1:1-7:2: Unexpected inferred main export `./index.js`, it’s recommended to use an export map such as `"exports": "./index.js"`
```

Fix:

```diff
@@ -1,4 +1,5 @@
 {
+  "exports": "./index.js",
   "files": [
     "index.js"
   ],
```

### `main-invalid`

`package.json`:

```json
{
  "files": [
    "index.js"
  ],
  "main": 1,
  "name": "x",
  "type": "commonjs"
}
```

Yields:

```txt
1:1-8:2: Unexpected inferred main export `./index.js`, it’s recommended to use an export map such as `"exports": "./index.js"`
5:11-5:12: Unexpected non-string `main` field `1`
```

Fix:

```diff
@@ -1,8 +1,8 @@
 {
+  "exports": "./index.js",
   "files": [
     "index.js"
   ],
-  "main": 1,
   "name": "x",
   "type": "commonjs"
 }
```

### `main-missing`

`package.json`:

```json
{
  "files": [
    "default.js"
  ],
  "name": "x",
  "type": "commonjs"
}
```

Yields:

```txt
1:1-7:2: Unexpected missing main module, it’s recommended to use an export map such as `"exports": "./index.js"`
```

Fix:

```diff
@@ -1,4 +1,5 @@
 {
+  "exports": "./default.js",
   "files": [
     "default.js"
   ],
```

### `main-not-found`

`package.json`:

```json
{
  "files": [
    "index.js"
  ],
  "main": "./missing.js",
  "name": "x",
  "type": "commonjs"
}
```

Yields:

```txt
1:1-8:2: Unexpected inferred main export `./index.js`, it’s recommended to use an export map such as `"exports": "./index.js"`
5:11-5:25: Unexpected missing file for `main` field `./missing.js`
```

Fix:

```diff
@@ -1,8 +1,8 @@
 {
+  "exports": "./index.js",
   "files": [
     "index.js"
   ],
-  "main": "./missing.js",
   "name": "x",
   "type": "commonjs"
 }
```

### `main-resolve-commonjs`

`package.json`:

```json
{
  "files": [
    "index.js"
  ],
  "main": "index",
  "name": "x",
  "type": "commonjs"
}
```

Yields:

```txt
5:11-5:18: Unexpected `main` field `index` that resolves to `./index.js` in CJS, this works but is slow and doesn’t work with `type: 'module', use the resolved value explicitly
```

Fix:

```diff
@@ -1,8 +1,8 @@
 {
+  "exports": "./index.js",
   "files": [
     "index.js"
   ],
-  "main": "index",
   "name": "x",
   "type": "commonjs"
 }
```

### `main-resolve-module`

`package.json`:

```json
{
  "files": [
    "index.js"
  ],
  "main": "index",
  "name": "x",
  "type": "module"
}
```

Yields:

```txt
1:1-9:2: Unexpected inferred main export `./index.js`, it’s recommended to use an export map such as `"exports": "./index.js"`
6:11-6:18: Unexpected `main` field `index` that does not resolve with `type: 'module'`, use an export map such as `"exports": "./index.js"`
```

Fix:

```diff
@@ -1,8 +1,8 @@
 {
+  "exports": "./index.js",
   "files": [
     "index.js"
   ],
-  "main": "index",
   "name": "x",
   "type": "module"
 }
```

### `name-missing`

`package.json`:

```json
{
  "exports": "./index.js",
  "files": [
    "index.js"
  ],
  "type": "module"
}
```

Yields:

```txt
1:1-7:2: Unexpected missing `name` field, expected a package name
```

Fix:

```diff
@@ -3,5 +3,6 @@
   "files": [
     "index.js"
   ],
+  "name": "x",
   "type": "module"
 }
```

### `npm-ignored`

`package.json`:

```json
{
  "exports": {
    ".": "./index.js",
    "./other": "./other.js"
  },
  "files": [
    "index.js"
  ],
  "name": "x",
  "type": "module"
}
```

Yields:

```txt
4:16-4:28: Unexpected file `./other.js` at `exports['./other']` which is excluded from the npm package, add it to `files` in `package.json`
```

Fix:

```diff
@@ -4,7 +4,8 @@
     "./other": "./other.js"
   },
   "files": [
-    "index.js"
+    "index.js",
+    "other.js"
   ],
   "name": "x",
   "type": "module"
```

### `type-invalid`

`package.json`:

```json
{
  "exports": "./index.js",
  "files": [
    "index.js"
  ],
  "name": "x",
  "type": "umd",
}
```

Yields:

```txt
7:11-7:16: Unexpected invalid `type` value `umd`, expected `commonjs` or `module`
```

Fix:

```diff
@@ -4,5 +4,5 @@
     "index.js"
   ],
   "name": "x",
-  "type": "umd"
+  "type": "module"
 }
```

### `type-missing`

`package.json`:

```json
{
  "exports": "./index.js",
  "files": [
    "index.js"
  ],
  "name": "x"
}
```

Yields:

```txt
1:1-7:2: Unexpected missing `type` field, expected `type: 'commonjs'` or `'module'`
```

Fix:

```diff
@@ -3,5 +3,6 @@
   "files": [
     "index.js"
   ],
-  "name": "x"
+  "name": "x",
+  "type": "commonjs"
 }
```

## Compatibility

This projects is compatible with maintained versions of Node.js.

When we cut a new major release, we drop support for unmaintained versions of
Node.
This means we try to keep the current release line, `package-exports@1`,
compatible with Node.js 18.

## Security

This package is safe.

## Contribute

Yes please!
See [How to Contribute to Open Source][open-source-guide-contribute].

## License

[MIT][file-license] © [Titus Wormer][wooorm]

<!-- Definitions -->

[api-package-exports]: #packageexportsfolder

[api-export]: #export

[api-result]: #result

[badge-build-image]: https://github.com/wooorm/package-exports/actions/workflows/main.yml/badge.svg

[badge-build-url]: https://github.com/wooorm/package-exports/actions

[badge-coverage-image]: https://img.shields.io/codecov/c/github/wooorm/package-exports.svg

[badge-coverage-url]: https://codecov.io/github/wooorm/package-exports

[badge-downloads-image]: https://img.shields.io/npm/dm/package-exports.svg

[badge-downloads-url]: https://www.npmjs.com/package/package-exports

[file-license]: license

[github-gist-esm]: https://gist.github.com/sindresorhus/a39789f98801d908bbc7ff3ecc99d99c

[github-vfile]: https://github.com/vfile/vfile

[npm-install]: https://docs.npmjs.com/cli/install

[open-source-guide-contribute]: https://opensource.guide/how-to-contribute/

[typescript]: https://www.typescriptlang.org

[wooorm]: https://wooorm.com
