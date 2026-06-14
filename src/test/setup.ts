import '@testing-library/jest-dom/vitest';
import fc from 'fast-check';

// Property-based tests run a fixed number of cases so CI is reproducible; a failing
// run prints the seed and a minimal counterexample to reproduce locally (TESTING.md).
fc.configureGlobal({ numRuns: 200 });
