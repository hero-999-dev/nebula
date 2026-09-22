import { expect, it } from 'vitest';
import { publicDocSource, renderMarkdown } from '../scripts/markdown.js';

it('keeps development attribution in source but excludes it from the published document', () => {
  const src = '# Changes\n\n<!-- agent-note: gpt6astra tarafından eklendi -->\n\nSaved safely.\n';
  expect(src).toContain('gpt6astra');
  const { html, outline } = renderMarkdown(publicDocSource(src));
  expect(html).not.toContain('gpt6astra');
  expect(html).not.toContain('agent-note');
  expect(html).toContain('Saved safely.');
  expect(outline).toHaveLength(1);
});
