"""Utility for cleaning text before sending to TTS systems."""
import re


def clean_text_for_tts(text: str) -> str:
    """
    Clean text to remove markdown, HTML, and special characters that TTS systems might read incorrectly.
    
    This function removes characters that can't be spoken such as:
    - Markdown formatting: *, **, _, `, #, etc.
    - HTML tags: <tag>, >, <
    - Special characters: |, \, ~, ^, etc.
    
    Note: The original text should be stored in the database before calling this function.
    This cleaned version is only used for TTS audio generation.
    
    Args:
        text: Raw text that may contain markdown, HTML, or special characters
    
    Returns:
        Cleaned text suitable for TTS
    """
    if not text:
        return ""
    
    # Remove HTML tags
    text = re.sub(r'<[^>]+>', '', text)
    
    # Remove markdown formatting
    # Remove bold/italic markers: **, *, _
    text = re.sub(r'\*\*([^*]+)\*\*', r'\1', text)  # Bold: **text** -> text
    text = re.sub(r'\*([^*]+)\*', r'\1', text)  # Italic: *text* -> text
    text = re.sub(r'_([^_]+)_', r'\1', text)  # Italic: _text_ -> text
    text = re.sub(r'`([^`]+)`', r'\1', text)  # Code: `text` -> text
    
    # Remove remaining asterisks, underscores, backticks, hash symbols
    text = text.replace('*', '')
    text = text.replace('_', '')
    text = text.replace('`', '')
    text = text.replace('#', '')
    
    # Remove markdown links: [text](url) -> text
    text = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', text)
    
    # Remove markdown images: ![alt](url) -> alt
    text = re.sub(r'!\[([^\]]*)\]\([^\)]+\)', r'\1', text)
    
    # Remove brackets and braces (but keep content)
    text = re.sub(r'\[([^\]]+)\]', r'\1', text)  # [text] -> text
    text = re.sub(r'\(([^\)]+)\)', r'\1', text)  # (text) -> text (but keep basic punctuation)
    
    # Remove curly braces content: {text} -> (empty, or just remove braces)
    text = re.sub(r'\{[^}]+\}', '', text)
    
    # Remove characters that can't be spoken (standalone special characters)
    # Remove standalone > and < (but keep content if they're part of words/numbers)
    text = re.sub(r'[<>]', '', text)  # Remove standalone < and >
    
    # Remove other non-speakable characters that might appear standalone
    # Keep common punctuation like . , ! ? : ; - but remove others
    text = re.sub(r'[|\\~^]', '', text)  # Remove pipe, backslash, tilde, caret
    
    # Remove multiple consecutive special characters
    text = re.sub(r'[^\w\s\.\,\!\?\:\;\-]+', ' ', text)  # Replace any remaining non-word/sentence chars with space
    
    # Clean up multiple spaces
    text = re.sub(r'\s+', ' ', text)
    
    # Remove leading/trailing whitespace
    text = text.strip()
    
    return text

