import { describe, expect, it } from 'vitest';
import { transformExpandedSkillContent } from '#src/unsafe/agent-session-patch.js';

function renderPythonVersion(content: string): string {
  return content.replaceAll('{{python-version}}', '3.14.5');
}

describe('transformExpandedSkillContent', () => {
  it('does not transform normal user prompts', () => {
    // Arrange
    const content = 'hello {{python-version}}';

    // Act
    const output = transformExpandedSkillContent(content, content, renderPythonVersion);

    // Assert
    expect(output).toBe('hello {{python-version}}');
  });

  it('transforms expanded skill content', () => {
    // Arrange
    const invocation = '/skill:test';
    const expandedContent = '<skill>{{python-version}}</skill>';

    // Act
    const output = transformExpandedSkillContent(invocation, expandedContent, renderPythonVersion);

    // Assert
    expect(output).toBe('<skill>3.14.5</skill>');
  });

  it('does not transform user-provided skill arguments', () => {
    // Arrange
    const invocation = '/skill:test check {{python-version}}';
    const expandedContent = '<skill>{{python-version}}</skill>\n\ncheck {{python-version}}';

    // Act
    const output = transformExpandedSkillContent(invocation, expandedContent, renderPythonVersion);

    // Assert
    expect(output).toBe('<skill>3.14.5</skill>\n\ncheck {{python-version}}');
  });

  it('does not transform unknown skill invocations', () => {
    // Arrange
    const content = '/skill:missing {{python-version}}';

    // Act
    const output = transformExpandedSkillContent(content, content, renderPythonVersion);

    // Assert
    expect(output).toBe('/skill:missing {{python-version}}');
  });
});
