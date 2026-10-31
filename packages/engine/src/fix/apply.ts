import { createTwoFilesPatch } from 'diff';
import type { ApplyResult, Edit } from './types.js';

function count(haystack: string, needle: string): number {
  if (!needle) return 0;
  let n = 0;
  for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + needle.length)) n++;
  return n;
}

/** Apply exact search/replace edits in order. An edit whose `find` is missing or ambiguous is skipped and reported. */
export function applyEdits(text: string, edits: Edit[]): ApplyResult {
  let out = text;
  let applied = 0;
  const failed: ApplyResult['failed'] = [];
  for (const edit of edits) {
    const n = count(out, edit.find);
    if (n === 0) failed.push({ edit, reason: 'Text to replace was not found in the file.' });
    else if (n > 1 && !edit.all) failed.push({ edit, reason: `Text to replace appears ${n} times; it must be unique.` });
    else {
      out = edit.all ? out.split(edit.find).join(edit.replace) : out.replace(edit.find, () => edit.replace);
      applied++;
    }
  }
  return { text: out, applied, failed };
}

/** Unified diff for display. */
export function unifiedDiff(path: string, before: string, after: string): string {
  return createTwoFilesPatch(`a/${path}`, `b/${path}`, before, after, '', '', { context: 3 });
}
