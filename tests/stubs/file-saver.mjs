// Stand-in for the browser-only `file-saver` under `node --test`: the exports' build functions are
// tested directly, and nothing in a test ever saves a file.
export function saveAs() {
  throw new Error('saveAs is not available in tests');
}
