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
  
  // Escape HTML
  const escapeHtml = (str) => {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  };
  
  // Process the text by splitting on code blocks
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  
  const parts = [];
  let lastIndex = 0;
  let match;
  
  // Find all code blocks and split text around them
  while ((match = codeBlockRegex.exec(text)) !== null) {
    // Add text before the code block
    if (match.index > lastIndex) {
      const textBefore = text.substring(lastIndex, match.index);
      parts.push({ type: 'text', content: textBefore });
    }
    
    // Add the code block
    const language = match[1] || 'plaintext';
    const code = match[2];
    parts.push({ type: 'code', language, content: code });
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add any remaining text after the last code block
  if (lastIndex < text.length) {
    const textAfter = text.substring(lastIndex);
    parts.push({ type: 'text', content: textAfter });
  }
  
  // Process each part
  const processedParts = parts.map(part => {
    if (part.type === 'code') {
      // Highlight the code
      let highlightedCode;
      try {
        if (part.language === 'plaintext' || !hljs.getLanguage(part.language)) {
          highlightedCode = escapeHtml(part.content);
        } else {
          highlightedCode = hljs.highlight(part.content, { language: part.language }).value;
        }
      } catch (e) {
        console.error('Highlighting error:', e);
        highlightedCode = escapeHtml(part.content);
      }
      
      const languageLabel = part.language !== 'plaintext' ? part.language : '';
      const codeId = `code-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      // Store original code content - use base64 encoding to avoid HTML attribute issues
      const base64Code = btoa(unescape(encodeURIComponent(part.content)));
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
        <pre><code class="hljs language-${part.language}" id="${codeId}">${highlightedCode}</code></pre>
      </div>`;
    } else {
      // Process text: handle inline code, escape HTML, convert newlines
      let processedText = part.content;
      
      // Replace inline code first (preserve backticks content)
      const inlineCodeParts = [];
      let inlineLastIndex = 0;
      const inlineCodeRegex = /`([^`]+)`/g;
      let inlineMatch;
      
      while ((inlineMatch = inlineCodeRegex.exec(part.content)) !== null) {
        if (inlineMatch.index > inlineLastIndex) {
          inlineCodeParts.push({
            type: 'text',
            content: part.content.substring(inlineLastIndex, inlineMatch.index)
          });
        }
        inlineCodeParts.push({
          type: 'inline-code',
          content: inlineMatch[1]
        });
        inlineLastIndex = inlineMatch.index + inlineMatch[0].length;
      }
      
      if (inlineLastIndex < part.content.length) {
        inlineCodeParts.push({
          type: 'text',
          content: part.content.substring(inlineLastIndex)
        });
      }
      
      // If no inline code was found, treat the whole thing as text
      if (inlineCodeParts.length === 0) {
        return escapeHtml(part.content).replace(/\n/g, '<br>');
      }
      
      // Process inline code parts
      return inlineCodeParts.map(p => {
        if (p.type === 'inline-code') {
          return `<code class="inline-code">${escapeHtml(p.content)}</code>`;
        } else {
          return escapeHtml(p.content).replace(/\n/g, '<br>');
        }
      }).join('');
    }
  });
  
  return processedParts.join('');
}
