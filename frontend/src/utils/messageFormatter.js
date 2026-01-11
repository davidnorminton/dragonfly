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
import { marked, Renderer } from 'marked';

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

// Configure marked with custom renderer for code blocks
const renderer = new Renderer();

// Custom code block renderer with syntax highlighting and copy button
renderer.code = function(code, language) {
  const validLanguage = language && hljs.getLanguage(language) ? language : 'plaintext';
  
  let highlightedCode;
  try {
    if (validLanguage === 'plaintext') {
      const div = document.createElement('div');
      div.textContent = code;
      highlightedCode = div.innerHTML;
    } else {
      highlightedCode = hljs.highlight(code, { language: validLanguage }).value;
    }
  } catch (e) {
    console.error('Highlighting error:', e);
    const div = document.createElement('div');
    div.textContent = code;
    highlightedCode = div.innerHTML;
  }
  
  const languageLabel = validLanguage !== 'plaintext' ? validLanguage : '';
  const codeId = `code-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const base64Code = btoa(unescape(encodeURIComponent(code)));
  
  return `<div class="code-block-wrapper">
    <div class="code-block-header">
      ${languageLabel ? `<div class="code-block-language">${languageLabel}</div>` : '<div></div>'}
      <button class="code-block-copy-btn" data-code-base64="${base64Code}" onclick="copyCodeBlock(this)" title="Copy code">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
        <span class="copy-text">Copy</span>
      </button>
    </div>
    <pre><code class="hljs language-${validLanguage}" id="${codeId}">${highlightedCode}</code></pre>
  </div>`;
};

// Custom inline code renderer
renderer.codespan = function(code) {
  return `<code class="inline-code">${code}</code>`;
};

// Configure marked options for v17+
marked.use({
  renderer: renderer,
  breaks: true, // Convert \n to <br>
  gfm: true, // GitHub Flavored Markdown
  headerIds: true,
  mangle: false,
  pedantic: false,
  smartLists: true
});

/**
 * Format a message with full markdown support and code highlighting.
 * Converts markdown to HTML with syntax highlighting for code blocks.
 */
export function formatMessage(text) {
  if (!text) return '';
  
  try {
    // Use marked to parse the markdown (in v17+, use marked() directly)
    const html = marked(text);
    return html;
  } catch (error) {
    console.error('Error parsing markdown:', error);
    // Fallback: escape and return as-is
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML.replace(/\n/g, '<br>');
  }
}
