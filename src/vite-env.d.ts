declare module '*.css';
// fake-indexeddb/auto exports map lacks a `types` entry; declare it here so
// noUncheckedSideEffectImports doesn't reject the side-effect import in tests.
declare module 'fake-indexeddb/auto';
