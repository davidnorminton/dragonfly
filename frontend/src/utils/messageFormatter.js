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
import yaml from 'highlight.js/lib/languages/yaml';
import markdown from 'highlight.js/lib/languages/markdown';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
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
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('yml', yaml);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('md', markdown);
hljs.registerLanguage('dockerfile', dockerfile);

// Configure marked with custom renderer for code blocks
const renderer = new Renderer();

// Custom code block renderer with syntax highlighting and copy button
renderer.code = function(code, language, escaped) {
  // CRITICAL: Ensure code is always a string, never an object
  let codeStr = '';
  if (code == null) {
    codeStr = '';
  } else if (typeof code === 'string') {
    codeStr = code;
  } else if (typeof code === 'object') {
    // If code is an object, try to extract string value
    if (code.text) {
      codeStr = String(code.text);
    } else if (code.content) {
      codeStr = String(code.content);
    } else if (code.code) {
      codeStr = String(code.code);
    } else {
      // Try JSON stringify as last resort
      try {
        codeStr = JSON.stringify(code, null, 2);
      } catch (e) {
        console.error('[Code Renderer] Failed to stringify code object:', e);
        codeStr = '';
      }
    }
  } else {
    codeStr = String(code);
  }
  
  // Debug: log what we're receiving
  if (typeof code !== 'string' || (language && typeof language !== 'string')) {
    console.warn('[Code Renderer] Non-string detected:', { 
      codeType: typeof code,
      code: code,
      language: language, 
      languageType: typeof language
    });
  }
  
  // Ensure language is always a string (handle cases where it might be an object or other type)
  let languageStr = '';
  if (language) {
    if (typeof language === 'string') {
      languageStr = language.trim().toLowerCase();
    } else if (typeof language === 'object' && language !== null) {
      // If language is an object, try to extract a string value
      // Check for common properties first
      if (language.lang) {
        languageStr = String(language.lang).trim().toLowerCase();
      } else if (language.language) {
        languageStr = String(language.language).trim().toLowerCase();
      } else if (language.name) {
        languageStr = String(language.name).trim().toLowerCase();
      } else {
        // If it's [object Object], just use empty string
        languageStr = '';
      }
    } else {
      languageStr = String(language).trim().toLowerCase();
    }
  }
  
  // Normalize language aliases
  const languageAliases = {
    'golang': 'go',
    'jsx': 'javascript',
    'tsx': 'typescript',
    'yml': 'yaml',
    'yaml': 'yaml',
    'markdown': 'markdown',
    'md': 'markdown',
    'dockerfile': 'dockerfile',
    'makefile': 'makefile',
  };
  
  // Normalize language string
  if (languageStr && languageAliases[languageStr]) {
    languageStr = languageAliases[languageStr];
  }
  
  // Validate language and check if hljs supports it
  // Ensure we always have a string, never an object
  let validLanguage = null;
  if (languageStr && typeof languageStr === 'string' && languageStr.length > 0) {
    const langCheck = hljs.getLanguage(languageStr);
    if (langCheck) {
      validLanguage = languageStr;
    }
  }
  
  let highlightedCode;
  try {
    if (validLanguage) {
      // Use specified language
      highlightedCode = hljs.highlight(codeStr, { language: validLanguage }).value;
    } else {
      // Auto-detect language if not specified or invalid
      const autoResult = hljs.highlightAuto(codeStr, [
        'javascript', 'python', 'bash', 'go', 'rust', 'java', 'cpp', 'c', 
        'typescript', 'css', 'html', 'json', 'sql', 'xml', 'php', 'ruby',
        'yaml', 'markdown', 'dockerfile'
      ]);
      highlightedCode = autoResult.value;
      // Use detected language for the label
      if (autoResult.language && !validLanguage) {
        validLanguage = autoResult.language;
      }
    }
  } catch (e) {
    console.error('Highlighting error:', e);
    // Fallback: try auto-detection
    try {
      const autoResult = hljs.highlightAuto(codeStr);
      highlightedCode = autoResult.value;
      if (autoResult.language) {
        validLanguage = autoResult.language;
      }
    } catch (autoError) {
      console.error('Auto-detection also failed:', autoError);
      const div = document.createElement('div');
      div.textContent = codeStr;
      highlightedCode = div.innerHTML;
    }
  }
  
  // Final safety check - ensure validLanguage is always a string or null
  if (validLanguage && typeof validLanguage !== 'string') {
    console.error('validLanguage is not a string:', typeof validLanguage, validLanguage);
    validLanguage = null;
  }
  
  // Only use language label if it's a valid string and not [object Object]
  // Double-check that validLanguage is actually a string and safe to display
  let languageLabel = '';
  if (validLanguage && 
      typeof validLanguage === 'string' && 
      validLanguage !== 'plaintext' &&
      validLanguage.toLowerCase() !== '[object object]' &&
      !validLanguage.toLowerCase().includes('[object') &&
      validLanguage.length > 0 &&
      validLanguage.length < 50) { // Reasonable max length
    languageLabel = validLanguage;
  }
  
  const codeId = `code-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const base64Code = btoa(unescape(encodeURIComponent(codeStr)));
  
  // Escape language label for safe HTML output - but only if we have a valid label
  const escapedLanguageLabel = languageLabel ? (() => {
    const div = document.createElement('div');
    div.textContent = languageLabel;
    const escaped = div.innerHTML;
    // Final safety check - don't use if it contains object references
    if (escaped.toLowerCase().includes('object')) {
      return '';
    }
    return escaped;
  })() : '';
  
  return `<div class="code-block-wrapper">
    <div class="code-block-header">
      ${escapedLanguageLabel ? `<div class="code-block-language">${escapedLanguageLabel}</div>` : '<div></div>'}
      <button class="code-block-copy-btn" data-code-base64="${base64Code}" onclick="copyCodeBlock(this)" title="Copy code">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
        <span class="copy-text">Copy</span>
      </button>
    </div>
    <pre><code class="hljs${validLanguage ? ` language-${validLanguage}` : ''}" id="${codeId}">${highlightedCode}</code></pre>
  </div>`;
};

// Custom inline code renderer
renderer.codespan = function(code) {
  // Ensure code is always a string, never an object
  let codeStr = '';
  if (code == null) {
    codeStr = '';
  } else if (typeof code === 'string') {
    codeStr = code;
  } else if (typeof code === 'object') {
    // If code is an object, try to extract string value
    if (code.text) {
      codeStr = String(code.text);
    } else if (code.content) {
      codeStr = String(code.content);
    } else if (code.code) {
      codeStr = String(code.code);
    } else {
      // Try JSON stringify as last resort
      try {
        codeStr = JSON.stringify(code, null, 2);
      } catch (e) {
        console.error('[Inline Code Renderer] Failed to stringify code object:', e);
        codeStr = '';
      }
    }
  } else {
    codeStr = String(code);
  }
  
  // Escape HTML to prevent XSS
  const div = document.createElement('div');
  div.textContent = codeStr;
  const escapedCode = div.innerHTML;
  
  return `<code class="inline-code">${escapedCode}</code>`;
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
