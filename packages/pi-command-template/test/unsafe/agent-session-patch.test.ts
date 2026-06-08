import { describe, expect, it } from 'vitest';
import { transformExpandedSkillContent } from '#src/unsafe/agent-session-patch.js';

describe('transformExpandedSkillContent', () => {
  it('does not transform normal user prompts', () => {
    const output = transformExpandedSkillContent('hello {{python-version}}', 'hello {{python-version}}', (content) =>
      content.replaceAll('{{python-version}}', '3.14.5')
    );

    expect(output).toBe('hello {{python-version}}');
  });

  it('transforms expanded skill content', () => {
    const output = transformExpandedSkillContent('/skill:test', '<skill>{{python-version}}</skill>', (content) =>
      content.replaceAll('{{python-version}}', '3.14.5')
    );

    expect(output).toBe('<skill>3.14.5</skill>');
  });

  it('does not transform user-provided skill arguments', () => {
    const output = transformExpandedSkillContent(
      '/skill:test check {{python-version}}',
      '<skill>{{python-version}}</skill>\n\ncheck {{python-version}}',
      (content) => content.replaceAll('{{python-version}}', '3.14.5')
    );

    expect(output).toBe('<skill>3.14.5</skill>\n\ncheck {{python-version}}');
  });

  it('does not transform unknown skill invocations', () => {
    const output = transformExpandedSkillContent(
      '/skill:missing {{python-version}}',
      '/skill:missing {{python-version}}',
      (content) => content.replaceAll('{{python-version}}', '3.14.5')
    );

    expect(output).toBe('/skill:missing {{python-version}}');
  });
});
