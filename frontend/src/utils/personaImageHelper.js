/**
 * Convert a stored persona image_path to a displayable URL
 * @param {string} imagePath - The image_path value from the database
 * @param {string} personaName - The persona's name
 * @returns {string|null} - The URL to display the image, or null if no image
 */
export function getPersonaImageUrl(imagePath, personaName) {
  // Handle null, undefined, empty string, or the string "null"
  if (!imagePath || imagePath === 'null' || imagePath === 'undefined' || !imagePath.trim()) {
    return null;
  }

  // Check for external URL (starts with http:// or https://)
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath;
  }

  // Local file path - use the persona image endpoint
  return `/api/personas/${encodeURIComponent(personaName)}/image`;
}
