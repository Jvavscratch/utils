# @jvavscratch/utils

Two things: the helpers that assemble a finished `.sb3`, and the API that
compiler-extension packages are written against.

## Packaging

- `zipFolderToSb3(folderPath)` — packs a prepared project directory into an `.sb3`.
- `createSprite()`, `createCostume()`, `createSound()` — build the sprite and asset
  entries of a `project.json`.
- `cloneFolderSync()`, `copyAllSync()`, `deleteAllContents()`, `fillDefaults()` —
  filesystem plumbing used while assembling a build.
- `readFile()` — read a file as a string.

## Writing a compiler extension

A package is loaded by the compiler at build time, so it extends the compiler
itself rather than the program being compiled. The authoring API is:

| Function | Purpose |
| --- | --- |
| `createFunction({ ... })` | Declare a function callable from source. |
| `createValueFunction` | The same thing, typed for reporters. |
| `createLibrary(name, functions)` | Group functions into a callable namespace (`mylib.thing()`). |
| `createGlobal(name, functions)` | Contribute a global. |
| `createImplementation(name, body)` | Override how a Babel node type is generated. |
| `createBlock` | Build a raw block. |

`createImplementation` returns a `{name, body}` pair, and that `name` is the Babel
node type string the compiler's dispatch tables match on.

`createFunction` takes a body invoked with the call site, the block cluster, the
parent block id, the build data, and optionally the already-evaluated arguments:

```ts
import { createFunction, createLibrary } from '@jvavscratch/utils';

export const myLibrary = createLibrary('mylib', {
  shout: createFunction({
    parseArguments: true,
    minimumArguments: 1,
    maximumArguments: 1,
    body: (call, cluster, parentId, buildData, args) => {
      // `args` holds the evaluated arguments; build and return a block here.
    },
  }),
});
```

`createFunction` enforces `minimumArguments` / `maximumArguments` and, when
`argTypes` is given, checks each argument's AST node type — raising a
`JvavscratchError` with source location rather than failing later.

## Install

This package is not published to npm. Depend on it straight from GitHub:

```json
{ "dependencies": { "@jvavscratch/utils": "github:Jvavscratch/utils" } }
```

If you want to *use* jvavscratch rather than build against its internals, install
the CLI instead:

```bash
npm install -g github:Jvavscratch/cli
```

## Documentation

- <https://jvavscratch.github.io/docs/modules/utils>
- <https://jvavscratch.github.io/docs/plugins> — writing an extension end to end

## License

MPL-2.0
