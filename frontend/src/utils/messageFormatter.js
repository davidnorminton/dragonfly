import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import python from 'highlight.js/lib/languages/python';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import json from 'highlight.js/lib/languages/json';
import sql from 'highlight.js/lib/languages/sql';
import xml from 'highlight.js/lib/languages/xml';
import typescript from 'highlight.js/lib/languages/typescript';
import java from 'highlight.js/lib/languages/java';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import ruby from 'highlight.js/lib/languages/ruby';
import php from 'highlight.js/lib/languages/php';

// Register languages
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('py', python);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('shell', bash);
hljs.registerLanguage('css', css);
hljs.registerLanguage('json', json);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('java', java);
hljs.registerLanguage('c', c);
hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('csharp', csharp);
hljs.registerLanguage('cs', csharp);
hljs.registerLanguage('go', go);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('ruby', ruby);
hljs.registerLanguage('rb', ruby);
hljs.registerLanguage('php', php);

/**
 * Format a message with code highlighting.
 * Converts markdown-style code blocks to HTML with syntax highlighting.
 */
export function formatMessage(text) {
  if (!text) return '';
  
  // Escape HTML first
  const escapeHtml = (str) => {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  };
  
  // Replace code blocks with highlighted versions
  // Match ```language\ncode\n``` pattern
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  
  let result = text;
  let match;
  const replacements = [];
  
  // Find all code blocks
  while ((match = codeBlockRegex.exec(text)) !== null) {
    const language = match[1] || 'plaintext';
    const code = match[2];
    
    let highlightedCode;
    try {
      if (language === 'plaintext' || !hljs.getLanguage(language)) {
        highlightedCode = escapeHtml(code);
      } else {
        highlightedCode = hljs.highlight(code, { language }).value;
      }
    } catch (e) {
      console.error('Highlighting error:', e);
      highlightedCode = escapeHtml(code);
    }
    
    const languageLabel = language !== 'plaintext' ? language : '';
    const htmlBlock = `<div class="code-block-wrapper">
      ${languageLabel ? `<div class="code-block-language">${languageLabel}</div>` : ''}
      <pre><code class="hljs language-${language}">${highlightedCode}</code></pre>
    </div>`;
    
    replacements.push({
      original: match[0],
      replacement: htmlBlock
    });
  }
  
  // Replace code blocks
  for (const { original, replacement } of replacements) {
    result = result.replace(original, replacement);
  }
  
  // Replace inline code (backticks)
  result = result.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
  
  // Escape remaining HTML and convert newlines to <br>
  const parts = result.split(/(<div class="code-block-wrapper">[\s\S]*?<\/div>|<code class="inline-code">.*?<\/code>)/);
  result = parts.map((part, i) => {
    if (part.startsWith('<div class="code-block-wrapper">') || part.startsWith('<code class="inline-code">')) {
      return part; // Keep code blocks and inline code as-is
    }
    return escapeHtml(part).replace(/\n/g, '<br>');
  }).join('');
  
  return result;
}
