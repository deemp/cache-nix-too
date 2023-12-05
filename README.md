# Cache Nix

A GitHub Action to cache Nix store paths using GitHub Actions cache.

This action is based on [actions/cache](https://github.com/actions/cache).

## What it can do

* Cache full Nix store into a single cache on `Linux` and `macOS` runners.
* Collect garbage in the store before saving.
* Merge caches produced by several jobs.
* After saving a new cache, remove old caches by creation or last access time.

## Approach

1. The [nix-quick-install-action](https://github.com/nixbuild/nix-quick-install-action) action makes `/nix/store` owned by an unpriviliged user.
1. `cache-nix-action` restores `/nix`.
   * When there's a cache hit, restoring `/nix/store` from a cache is faster than downloading multiple paths from binary caches.
      * You can compare run times of jobs with and without store caching in [Actions](https://github.com/nix-community/cache-nix-action/actions/workflows/ci.yaml).
      * Open a run and click on the time under `Total duration`.

1. Optionally, `cache-nix-action` purges old caches.
   * As Nix (flake) inputs may change, it's necessary to use fresher caches.
   * Caches can be purged by `created` or `last accessed` time (see [Configuration](#configuration)).

1. Optionally, `cache-nix-action` collects garbage in the Nix store (see [Garbage Collection](#garbage-collection)).
   * The store may contain useless paths from previous runs.
   * This action allows to limit nix store size (see [Configuration](#configuration)).

1. `cache-nix-action` saves a new cache when there's no cache hit.
   * Limitations:
      * Saving a cache takes time.
      * There may be no cache hit after an old matching cache was purged.

## Limitations

* `GitHub` allows only 10GB of caches and then removes the least recently used entries (see its [eviction policy](https://docs.github.com/en/actions/using-workflows/caching-dependencies-to-speed-up-workflows#usage-limits-and-eviction-policy)).
  * Can be overcome by merging similar caches (see [Merge caches](#merge-caches))
* `cache-nix-action` restores and saves the whole `/nix` directory.
* `cache-nix-action` requires `nix-quick-install-action` (see [Approach](#approach)).
* Store size is limited by a runner storage size ([link](https://docs.github.com/en/actions/using-github-hosted-runners/about-github-hosted-runners#supported-runners-and-hardware-resources)).
* Caches are isolated between branches ([link](https://docs.github.com/en/actions/using-workflows/caching-dependencies-to-speed-up-workflows#restrictions-for-accessing-a-cache)).
* When restoring, `cache-nix-action` writes cached Nix store paths into a read-only `/nix/store` of a runner.
  Some of these paths may already be present, so the action will show `File exists` errors and a warning that it failed to restore.
  It's OK.
* It may be necessary to purge old caches (see [Purge old caches](#purge-old-caches)).

See alternative [caching approaches](#caching-approaches).

See how you can [contribute](#contribute).

## Configuration

See [action.yaml](action.yml), [restore/action.yml](restore/action.yml), [save/action.yml](save/action.yml).

This action inherits some [inputs](#inputs) and [outputs](#outputs) of `actions/cache`.

### New inputs

| `name`                    | `description`                                                                                                           | `required` | `default` | `needs`                |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------- | --------- | ---------------------- |
| `gc-macos`                | When `true`, enables on `macOS` runners Nix store garbage collection before saving a cache.                             | `false`    | `false`   | `gc-macos: true`       |
| `gc-max-store-size-macos` | Maximum Nix store size in bytes on `macOS` runners.                                                                     | `false`    |           |                        |
| `gc-linux`                | When `true`, enables on `Linux` runners Nix store garbage collection before saving a cache.                             | `false`    | `false`   |                        |
| `gc-max-store-size-linux` | Maximum Nix store size in bytes on `Linux` runners.                                                                     | `false`    |           | `gc-linux: true`       |
| `purge`                   | When `true`, purge old caches before saving a new cache with a `key`.                                                   | `false`    | `false`   |                        |
| `purge-keys`              | A newline-separated list of cache key prefixes used to purge caches. An empty list is equivalent to the `key` input.    | `false`    | `''`      | `purge: true`          |
| `purge-accessed`          | When `true`, purge caches by their last access time.                                                                    | `false`    | `false`   | `purge: true`          |
| `purge-accessed-max-age`  | Purge caches last accessed more than this number of seconds ago.                                                        | `false`    | `604800`  | `purge-accessed: true` |
| `purge-created`           | When `true`, delete caches by their creation time.                                                                      | `false`    | `true`    | `purge: true`          |
| `purge-created-max-age`   | Purge caches created more than this number of seconds ago.                                                              | `false`    | `604800`  | `purge-created: true`. |
| `restore-key-hit`         | When true, if a cache key matching `restore-keys` exists, it counts as a cache hit. Thus, a job won't save a new cache. | `false`    | `false`   |                        |
| `extra-restore-keys`      | A newline-separated list of key prefixes used for restoring multiple caches.                                            | `false`    | `''`      |                        |

Note:

* `cache-nix-action` purges only caches specific to a branch that has triggered a workflow.
* `*-max-age` is relative to the time before saving a new cache.

### Removed inputs

The `cache-nix-action` doesn't provide the `path` input from the original [inputs](#inputs) of `actions/cache` due to [limitations](#limitations).
Instead, the `cache-nix-action` caches `/nix`, `~/.cache/nix`, `~root/.cache/nix` paths by default as suggested [here](https://github.com/divnix/nix-cache-action/blob/b14ec98ae694c754f57f8619ea21b6ab44ccf6e7/action.yml#L7).

## Usage

* This action **must** be used with [nix-quick-install-action](https://github.com/nixbuild/nix-quick-install-action).
* Maximum Nix store size on `Linux` runners will be `~1GB` due to `gc-max-store-size-linux: 1000000000`.
  * If the store has a larger size, it will be garbage collected to reach this limit (See [Garbage collection parameters](#garbage-collection-parameters)).
  * The `cache-nix-action` will print the Nix store size in the `Post` phase, so you can choose an optimal store size to avoid garbage collection.
* On `macOS` runners, Nix store won't be garbage collected since `gc-macos: true` isn't set.
* The `cache-nix-action` will find caches with a key prefix `cache-${{ matrix.os }}-`.
  Among these caches, the `cache-nix-action` will delete caches created more than `42` seconds ago

```yaml
- uses: nixbuild/nix-quick-install-action@v25
  with:
    nix_conf: |
      substituters = https://cache.nixos.org/ https://nix-community.cachix.org
      trusted-public-keys = cache.nixos.org-1:6NCHdD59X431o0gWypbMrAURkbJ16ZPMQFGspcDShjY= nix-community.cachix.org-1:mB9FSh9qf2dCimDSUo8Zy7bkq5CX+/rkCWyvRCYg3Fs=
      keep-outputs = true

- name: Restore and cache Nix store
  uses: nix-community/cache-nix-action@v3
  with:
    key: cache-${{ matrix.os }}-${{ hashFiles('**/*.nix') }}
    restore-keys: |
      cache-${{ matrix.os }}-

    gc-linux: true
    gc-max-store-size-linux: 1000000000
    
    purge-caches: true
    purge-key: cache-${{ matrix.os }}-
    purge-created: true
    purge-created-max-age: 42
```

### Example workflow

See [ci.yaml](.github/workflows/ci.yaml).

### Troubleshooting

* Use [action-tmate](https://github.com/mxschmitt/action-tmate) to debug on a runner via SSH.

### Garbage collection parameters

On `Linux` runners, when `gc-linux` is `true`, when a cache size is greater than `gc-max-cache-size-linux`, this action will run `nix store gc --max R` before saving a cache.
Here, `R` is `max(0, S - gc-max-store-size-linux)`, where `S` is the current store size.
Respective conditions hold for `macOS` runners.

There are alternative approaches to garbage collection (see [Garbage collection](#garbage-collection)).

### Purge old caches

The `cache-nix-action` allows to delete old caches after saving a new cache (see `purge-*` inputs in [New inputs](#new-inputs) and `compare-run-times` in [Example workflow](#example-workflow)).

The [purge-cache](https://github.com/MyAlbum/purge-cache) action allows to remove caches based on their `last accessed` or `created` time without branch limitations.

Alternatively, you can use the [GitHub Actions Cache API](https://docs.github.com/en/rest/actions/cache).

### Merge caches

`GitHub` evicts LRU caches when their total size exceeds `10GB` (see [Limitations](#limitations)).

If you have multiple similar caches, you can merge them into a single cache and store just it to save space.

In short:

1. Matrix jobs produce similar caches.
1. The next job restores all of these individual caches, saves a common cache, and purges individual caches.
1. On subsequent runs, matrix jobs use the common cache.

See the `make-similar-caches` and `merge-similar-caches` jobs in the [example workflow](#example-workflow).

**Pros**: if `N` individual caches are very similar, a common cache will take approximately `N` times less space.
**Cons**: if caches aren't very similar, run time may increase due to a bigger common cache.

### Get more space on a runner

The [jlumbroso/free-disk-space](https://github.com/jlumbroso/free-disk-space) action frees `~30GB` of disk space in several minutes.

## Caching approaches

Discussed in more details [here](https://github.com/DeterminateSystems/magic-nix-cache-action/issues/16) and [here](https://github.com/nixbuild/nix-quick-install-action/issues/33).

Caching approaches work at different "distances" from `/nix/store` of GitHub Actions runner.
These distances affect the restore and save speed.

### GitHub Actions

* [DeterminateSystems/magic-nix-cache-action](https://github.com/DeterminateSystems/magic-nix-cache-action)
* [nix-community/cache-nix-action](https://github.com/nix-community/cache-nix-action)

#### cache-nix-action

**Pros**:

* Free.
* Uses `GitHub Actions Cache` and works fast.
* Easy to set up.
* Allows to save a store of at most a given size (see [Garbage collection parameters](#garbage-collection-parameters)).
* Allows to save outputs from garbage collection (see [Garbage collection](#garbage-collection)).

**Cons**: see [Limitations](#limitations)

#### magic-nix-cache-action

**Pros** ([link](https://github.com/DeterminateSystems/magic-nix-cache#why-use-the-magic-nix-cache)):

* Free.
* Uses `GitHub Actions Cache` and works fast.
* Easy to set up.
* Restores and saves paths selectively.

**Cons**:

* Collects telemetry ([link](https://github.com/DeterminateSystems/magic-nix-cache))
* May trigger rate limit errors ([link](https://github.com/DeterminateSystems/magic-nix-cache#usage-notes)).
* Follows the GitHub Actions Cache semantics ([link](https://docs.github.com/en/actions/using-workflows/caching-dependencies-to-speed-up-workflows#restrictions-for-accessing-a-cache)).
  * Caches are isolated between branches ([link](https://docs.github.com/en/actions/using-workflows/caching-dependencies-to-speed-up-workflows#restrictions-for-accessing-a-cache)).
* Saves a cache for each path in a store and quickly litters `Caches`.

#### actions/cache

If used with [nix-quick-install-action](https://github.com/nixbuild/nix-quick-install-action), it's similar to the [cache-nix-action](#cache-nix-action).

If used with [install-nix-action](https://github.com/cachix/install-nix-action) and a [chroot local store](https://nixos.org/manual/nix/unstable/command-ref/new-cli/nix3-help-stores.html#local-store):

**Pros**:

* Quick restore and save `/tmp/nix`.

**Cons**:

* Slow [nix copy](https://nixos.org/manual/nix/unstable/command-ref/new-cli/nix3-copy.html) from `/tmp/nix` to `/nix/store`.

If used with [install-nix-action](https://github.com/cachix/install-nix-action) and this [trick](https://github.com/cachix/install-nix-action/issues/56#issuecomment-1030697681), it's similar to the [cache-nix-action](#cache-nix-action), but slower ([link](https://github.com/ryantm/nix-installer-action-benchmark)).

### Hosted binary caches

See [binary cache](https://nixos.org/manual/nix/unstable/glossary.html#gloss-binary-cache), [HTTP Binary Cache Store](https://nixos.org/manual/nix/unstable/command-ref/new-cli/nix3-help-stores.html#http-binary-cache-store).

* [cachix](https://www.cachix.org/)
* [attic](https://github.com/zhaofengli/attic)

**Pros**:

* Restore and save paths selectively.
* Provide LRU garbage collection strategies ([cachix](https://docs.cachix.org/garbage-collection?highlight=garbage), [attic](https://github.com/zhaofengli/attic#goals)).
* Don't cache paths available from the NixOS cache ([cachix](https://docs.cachix.org/garbage-collection?highlight=upstream)).
* Allow to share paths between projects ([cachix](https://docs.cachix.org/getting-started#using-binaries-with-nix)).

**Cons**:

* Have limited free storage ([cachix](https://www.cachix.org/pricing) gives 5GB for open-source projects).
* Need good bandwidth for receiving and pushing paths over the Internet.
* Can be down.

## Garbage collection

When restoring a Nix store from a cache, the store may contain old unnecessary paths.
These paths should be removed sometimes to limit cache size and ensure the fastest restore/save steps.

### GC approach 1

Produce a cache once, use it multiple times. Don't collect garbage.

Advantages:

* Unnecessary paths are saved to a cache only during a new save.

Disadvantages:

* Unnecessary paths can accumulate between new saves.
  * A job at the firs run produces a path `A` and saves a cache.
  * The job at the second run restores the cache, produces a path `B`, and saves a cache. The cache has both `A` and `B`.
  * etc.

### GC approach 2

Collect garbage before saving a cache.

Advantages:

* Automatically keep cache at a minimal/limited size

Disadvantages:

* No standard way to gc only old paths.

### Save a path from GC

* Use `nix profile install` to save installables from garbage collection.
  * Get store paths of `inputs` via `nix flake archive` (see [comment](https://github.com/NixOS/nix/issues/4250#issuecomment-1146878407)).
  * Get outputs via `nix flake show --json | jq  '.packages."x86_64-linux"|keys[]'| xargs -I {}` on `x86_64-linux` (see this [issue](https://github.com/NixOS/nix/issues/7165)).
* Keep inputs (see this [issue](https://github.com/NixOS/nix/issues/4250) and this [issue](https://github.com/NixOS/nix/issues/6895)).
* Start [direnv](https://github.com/nix-community/nix-direnv) in background.

### Garbage collection approaches

* Use [nix-heuristic-gc](https://github.com/risicle/nix-heuristic-gc) for cache eviction via `atime`
* gc via gc roots [nix-cache-cut](https://github.com/astro/nix-cache-cut)
* gc based on time [cache-gc](https://github.com/lheckemann/cache-gc)

## Contribute

* Improve README
* Report errors, suggest improvements in issues
* Upgrade code.
  * Read about [JavaScript actions](https://docs.github.com/en/actions/creating-actions/about-custom-actions?learn=create_actions&learnProduct=actions#javascript-actions)
  * See main files:
    * [restoreImpl.ts](./src/restoreImpl.ts)
    * [saveImpl.ts](./src/saveImpl.ts)
    * [acton.yml](./action.yml)
    * [save/action.yml](./save/action.yml)
    * [restore/action.yml](./restore/action.yml)

# Cache action

## !!! This documentation was inherited from actions/cache and may be partially irrelevant to cache-nix-action

This action allows caching dependencies and build outputs to improve workflow execution time.

>Two other actions are available in addition to the primary `cache` action:
>
>* [Restore action](./restore/README.md)
>* [Save action](./save/README.md)

[![Tests](https://github.com/actions/cache/actions/workflows/workflow.yml/badge.svg)](https://github.com/actions/cache/actions/workflows/workflow.yml)

## Documentation

See ["Caching dependencies to speed up workflows"](https://docs.github.com/en/actions/using-workflows/caching-dependencies-to-speed-up-workflows).

## What's New

### v3

* Added support for caching in GHES 3.5+.
* Fixed download issue for files > 2GB during restore.
* Updated the minimum runner version support from node 12 -> node 16.
* Fixed avoiding empty cache save when no files are available for caching.
* Fixed tar creation error while trying to create tar with path as `~/` home folder on `ubuntu-latest`.
* Fixed zstd failing on amazon linux 2.0 runners.
* Fixed cache not working with github workspace directory or current directory.
* Fixed the download stuck problem by introducing a timeout of 1 hour for cache downloads.
* Fix zstd not working for windows on gnu tar in issues.
* Allowing users to provide a custom timeout as input for aborting download of a cache segment using an environment variable `SEGMENT_DOWNLOAD_TIMEOUT_MINS`. Default is 10 minutes.
* New actions are available for granular control over caches - [restore](restore/action.yml) and [save](save/action.yml).
* Support cross-os caching as an opt-in feature. See [Cross OS caching](./tips-and-workarounds.md#cross-os-cache) for more info.
* Added option to fail job on cache miss. See [Exit workflow on cache miss](./restore/README.md#exit-workflow-on-cache-miss) for more info.
* Fix zstd not being used after zstd version upgrade to 1.5.4 on hosted runners
* Added option to lookup cache without downloading it.
* Reduced segment size to 128MB and segment timeout to 10 minutes to fail fast in case the cache download is stuck.

See the [v2 README.md](https://github.com/actions/cache/blob/v2/README.md) for older updates.

## Usage

### Pre-requisites

Create a workflow `.yml` file in your repository's `.github/workflows` directory. An [example workflow](#example-cache-workflow) is available below. For more information, see the GitHub Help Documentation for [Creating a workflow file](https://help.github.com/en/articles/configuring-a-workflow#creating-a-workflow-file).

If you are using this inside a container, a POSIX-compliant `tar` needs to be included and accessible from the execution path.

If you are using a `self-hosted` Windows runner, `GNU tar` and `zstd` are required for [Cross-OS caching](https://github.com/actions/cache/blob/main/tips-and-workarounds.md#cross-os-cache) to work. They are also recommended to be installed in general so the performance is on par with `hosted` Windows runners.

### Inputs

* `key` - An explicit key for a cache entry. See [creating a cache key](#creating-a-cache-key).
* `path` - A list of files, directories, and wildcard patterns to cache and restore. See [`@actions/glob`](https://github.com/actions/toolkit/tree/main/packages/glob) for supported patterns.
* `restore-keys` - An ordered list of prefix-matched keys to use for restoring stale cache if no cache hit occurred for key.
* `fail-on-cache-miss` - Fail the workflow if cache entry is not found. Default: `false`

#### Environment Variables

* `SEGMENT_DOWNLOAD_TIMEOUT_MINS` - Segment download timeout (in minutes, default `10`) to abort download of the segment if not completed in the defined number of minutes. [Read more](https://github.com/actions/cache/blob/main/tips-and-workarounds.md#cache-segment-restore-timeout)

### Outputs

* `cache-hit` - A boolean value to indicate an exact match was found for the key.

    > **Note** `cache-hit` will only be set to `true` when a cache hit occurs for the exact `key` match. For a partial key match via `restore-keys` or a cache miss, it will be set to `false`.

See [Skipping steps based on cache-hit](#skipping-steps-based-on-cache-hit) for info on using this output

### Cache scopes

The cache is scoped to the key, [version](#cache-version), and branch. The default branch cache is available to other branches.

See [Matching a cache key](https://help.github.com/en/actions/configuring-and-managing-workflows/caching-dependencies-to-speed-up-workflows#matching-a-cache-key) for more info.

### Example cache workflow

#### Restoring and saving cache using a single action

```yaml
name: Caching Primes

on: push

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v3

    - name: Cache Primes
      id: cache-primes
      uses: actions/cache@v3
      with:
        path: prime-numbers
        key: ${{ runner.os }}-primes

    - name: Generate Prime Numbers
      if: steps.cache-primes.outputs.cache-hit != 'true'
      run: /generate-primes.sh -d prime-numbers

    - name: Use Prime Numbers
      run: /primes.sh -d prime-numbers
```

The `cache` action provides a `cache-hit` output which is set to `true` when the cache is restored using the primary `key` and `false` when the cache is restored using `restore-keys` or no cache is restored.

#### Using a combination of restore and save actions

```yaml
name: Caching Primes

on: push

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v3

    - name: Restore cached Primes
      id: cache-primes-restore
      uses: actions/cache/restore@v3
      with:
        path: |
          path/to/dependencies
          some/other/dependencies
        key: ${{ runner.os }}-primes
    .
    . //intermediate workflow steps
    .
    - name: Save Primes
      id: cache-primes-save
      uses: actions/cache/save@v3
      with:
        path: |
          path/to/dependencies
          some/other/dependencies
        key: ${{ steps.cache-primes-restore.outputs.cache-primary-key }}
```

> **Note**
> You must use the `cache` or `restore` action in your workflow before you need to use the files that might be restored from the cache. If the provided `key` matches an existing cache, a new cache is not created and if the provided `key` doesn't match an existing cache, a new cache is automatically created provided the job completes successfully.

## Caching Strategies

With the introduction of the `restore` and `save` actions, a lot of caching use cases can now be achieved. Please see the [caching strategies](./caching-strategies.md) document for understanding how you can use the actions strategically to achieve the desired goal.

## Implementation Examples

Every programming language and framework has its own way of caching.

See [Examples](examples.md) for a list of `actions/cache` implementations for use with:

* [C# - NuGet](./examples.md#c---nuget)
* [Clojure - Lein Deps](./examples.md#clojure---lein-deps)
* [D - DUB](./examples.md#d---dub)
* [Deno](./examples.md#deno)
* [Elixir - Mix](./examples.md#elixir---mix)
* [Go - Modules](./examples.md#go---modules)
* [Haskell - Cabal](./examples.md#haskell---cabal)
* [Haskell - Stack](./examples.md#haskell---stack)
* [Java - Gradle](./examples.md#java---gradle)
* [Java - Maven](./examples.md#java---maven)
* [Node - npm](./examples.md#node---npm)
* [Node - Lerna](./examples.md#node---lerna)
* [Node - Yarn](./examples.md#node---yarn)
* [OCaml/Reason - esy](./examples.md#ocamlreason---esy)
* [PHP - Composer](./examples.md#php---composer)
* [Python - pip](./examples.md#python---pip)
* [Python - pipenv](./examples.md#python---pipenv)
* [R - renv](./examples.md#r---renv)
* [Ruby - Bundler](./examples.md#ruby---bundler)
* [Rust - Cargo](./examples.md#rust---cargo)
* [Scala - SBT](./examples.md#scala---sbt)
* [Swift, Objective-C - Carthage](./examples.md#swift-objective-c---carthage)
* [Swift, Objective-C - CocoaPods](./examples.md#swift-objective-c---cocoapods)
* [Swift - Swift Package Manager](./examples.md#swift---swift-package-manager)
* [Swift - Mint](./examples.md#swift---mint)

## Creating a cache key

A cache key can include any of the contexts, functions, literals, and operators supported by GitHub Actions.

For example, using the [`hashFiles`](https://docs.github.com/en/actions/learn-github-actions/expressions#hashfiles) function allows you to create a new cache when dependencies change.

```yaml
  - uses: actions/cache@v3
    with:
      path: |
        path/to/dependencies
        some/other/dependencies
      key: ${{ runner.os }}-${{ hashFiles('**/lockfiles') }}
```

Additionally, you can use arbitrary command output in a cache key, such as a date or software version:

```yaml
  # http://man7.org/linux/man-pages/man1/date.1.html
  - name: Get Date
    id: get-date
    run: |
      echo "date=$(/bin/date -u "+%Y%m%d")" >> $GITHUB_OUTPUT
    shell: bash

  - uses: actions/cache@v3
    with:
      path: path/to/dependencies
      key: ${{ runner.os }}-${{ steps.get-date.outputs.date }}-${{ hashFiles('**/lockfiles') }}
```

See [Using contexts to create cache keys](https://help.github.com/en/actions/configuring-and-managing-workflows/caching-dependencies-to-speed-up-workflows#using-contexts-to-create-cache-keys)

## Cache Limits

A repository can have up to 10GB of caches. Once the 10GB limit is reached, older caches will be evicted based on when the cache was last accessed.  Caches that are not accessed within the last week will also be evicted.

## Skipping steps based on cache-hit

Using the `cache-hit` output, subsequent steps (such as install or build) can be skipped when a cache hit occurs on the key.  It is recommended to install missing/updated dependencies in case of a partial key match when the key is dependent on the `hash` of the package file.

Example:

```yaml
steps:
  - uses: actions/checkout@v3

  - uses: actions/cache@v3
    id: cache
    with:
      path: path/to/dependencies
      key: ${{ runner.os }}-${{ hashFiles('**/lockfiles') }}

  - name: Install Dependencies
    if: steps.cache.outputs.cache-hit != 'true'
    run: /install.sh
```

> **Note** The `id` defined in `actions/cache` must match the `id` in the `if` statement (i.e. `steps.[ID].outputs.cache-hit`)

## Cache Version

Cache version is a hash [generated](https://github.com/actions/toolkit/blob/500d0b42fee2552ae9eeb5933091fe2fbf14e72d/packages/cache/src/internal/cacheHttpClient.ts#L73-L90) for a combination of compression tool used (Gzip, Zstd, etc. based on the runner OS) and the `path` of directories being cached. If two caches have different versions, they are identified as unique caches while matching. This, for example, means that a cache created on a `windows-latest` runner can't be restored on `ubuntu-latest` as cache `Version`s are different.

> Pro tip: The [list caches](https://docs.github.com/en/rest/actions/cache#list-github-actions-caches-for-a-repository) API can be used to get the version of a cache. This can be helpful to troubleshoot cache miss due to version.

<details>
  <summary>Example</summary>
The workflow will create 3 unique caches with same keys. Ubuntu and windows runners will use different compression technique and hence create two different caches. And `build-linux` will create two different caches as the `paths` are different.

```yaml
jobs:
  build-linux:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Cache Primes
        id: cache-primes
        uses: actions/cache@v3
        with:
          path: prime-numbers
          key: primes

      - name: Generate Prime Numbers
        if: steps.cache-primes.outputs.cache-hit != 'true'
        run: ./generate-primes.sh -d prime-numbers

      - name: Cache Numbers
        id: cache-numbers
        uses: actions/cache@v3
        with:
          path: numbers
          key: primes

      - name: Generate Numbers
        if: steps.cache-numbers.outputs.cache-hit != 'true'
        run: ./generate-primes.sh -d numbers

  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v3

      - name: Cache Primes
        id: cache-primes
        uses: actions/cache@v3
        with:
          path: prime-numbers
          key: primes

      - name: Generate Prime Numbers
        if: steps.cache-primes.outputs.cache-hit != 'true'
        run: ./generate-primes -d prime-numbers
```

</details>

## Known practices and workarounds

There are a number of community practices/workarounds to fulfill specific requirements. You may choose to use them if they suit your use case. Note these are not necessarily the only solution or even a recommended solution.

* [Cache segment restore timeout](./tips-and-workarounds.md#cache-segment-restore-timeout)
* [Update a cache](./tips-and-workarounds.md#update-a-cache)
* [Use cache across feature branches](./tips-and-workarounds.md#use-cache-across-feature-branches)
* [Cross OS cache](./tips-and-workarounds.md#cross-os-cache)
* [Force deletion of caches overriding default cache eviction policy](./tips-and-workarounds.md#force-deletion-of-caches-overriding-default-cache-eviction-policy)

### Windows environment variables

Please note that Windows environment variables (like `%LocalAppData%`) will NOT be expanded by this action. Instead, prefer using `~` in your paths which will expand to the HOME directory. For example, instead of `%LocalAppData%`, use `~\AppData\Local`. For a list of supported default environment variables, see the [Learn GitHub Actions: Variables](https://docs.github.com/en/actions/learn-github-actions/variables#default-environment-variables) page.

## Contributing

We would love for you to contribute to `actions/cache`. Pull requests are welcome! Please see the [CONTRIBUTING.md](CONTRIBUTING.md) for more information.

## License

The scripts and documentation in this project are released under the [MIT License](LICENSE)
