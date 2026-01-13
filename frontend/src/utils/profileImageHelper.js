/**
 * Convert a stored profile_picture path to a displayable URL
 * @param {string} profilePicture - The profile_picture value from the database
 * @param {number} userId - The user's ID
 * @returns {string|null} - The URL to display the image, or null if no image
 */
export function getProfileImageUrl(profilePicture, userId) {
  // Handle null, undefined, empty string, or the string "null"
  if (!profilePicture || profilePicture === 'null' || profilePicture === 'undefined' || !profilePicture.trim()) {
    return null;
  }

  // Check for external URL (starts with http:// or https://)
  if (profilePicture.startsWith('http://') || profilePicture.startsWith('https://')) {
    return profilePicture;
  }

  // Check for local avatar file (contains 'avatars' in path)
  if (profilePicture.includes('avatars') && profilePicture.includes('ai-avatar-')) {
    // Extract just the filename (e.g., "ai-avatar-02.svg")
    const filename = profilePicture.split('/').pop();
    return `/api/users/avatars/${filename}`;
  }

  // Legacy local upload - use the profile picture endpoint
  return `/api/users/${userId}/profile-picture`;
}
