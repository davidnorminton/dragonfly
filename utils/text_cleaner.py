"""Utility for cleaning text before sending to TTS systems."""
import re


def clean_text_for_tts(text: str) -> str:
    """
    Clean text to remove markdown, HTML, and special characters that TTS systems might read incorrectly.
    
    This function removes characters that can't be spoken such as:
    - Markdown formatting: *, **, _, `, #, etc.
    - HTML tags: <tag>, >, <
    - Special characters: |, \, ~, ^, etc.
    - Apostrophes and contractions (for better TTS pronunciation)
    
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
    
    # Expand common contractions before removing apostrophes
    # This ensures better TTS pronunciation
    contractions = {
        "I'm": "I am",
        "you're": "you are",
        "he's": "he is",
        "she's": "she is",
        "it's": "it is",
        "we're": "we are",
        "they're": "they are",
        "I've": "I have",
        "you've": "you have",
        "we've": "we have",
        "they've": "they have",
        "I'll": "I will",
        "you'll": "you will",
        "he'll": "he will",
        "she'll": "she will",
        "it'll": "it will",
        "we'll": "we will",
        "they'll": "they will",
        "I'd": "I would",
        "you'd": "you would",
        "he'd": "he would",
        "she'd": "she would",
        "it'd": "it would",
        "we'd": "we would",
        "they'd": "they would",
        "isn't": "is not",
        "aren't": "are not",
        "wasn't": "was not",
        "weren't": "were not",
        "hasn't": "has not",
        "haven't": "have not",
        "hadn't": "had not",
        "doesn't": "does not",
        "don't": "do not",
        "didn't": "did not",
        "won't": "will not",
        "wouldn't": "would not",
        "can't": "cannot",
        "couldn't": "could not",
        "shouldn't": "should not",
        "mightn't": "might not",
        "mustn't": "must not",
        "let's": "let us",
        "that's": "that is",
        "who's": "who is",
        "what's": "what is",
        "where's": "where is",
        "when's": "when is",
        "why's": "why is",
        "how's": "how is",
        "there's": "there is",
        "here's": "here is",
    }
    
    # Replace contractions (case-insensitive)
    for contraction, expanded in contractions.items():
        # Match word boundaries to avoid replacing parts of words
        text = re.sub(r'\b' + re.escape(contraction) + r'\b', expanded, text, flags=re.IGNORECASE)
    
    # Remove any remaining apostrophes
    text = text.replace("'", "")
    text = text.replace("'", "")  # Also remove curly apostrophe
    text = text.replace("`", "")  # Remove backtick
    
    # Remove markdown formatting
    # Remove bold/italic markers: **, *, _
    text = re.sub(r'\*\*([^*]+)\*\*', r'\1', text)  # Bold: **text** -> text
    text = re.sub(r'\*([^*]+)\*', r'\1', text)  # Italic: *text* -> text
    text = re.sub(r'_([^_]+)_', r'\1', text)  # Italic: _text_ -> text
    
    # Remove remaining asterisks, underscores, hash symbols
    text = text.replace('*', '')
    text = text.replace('_', '')
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

