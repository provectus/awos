/**
 * Pattern matching utility
 * Handles glob-like pattern matching for file operations
 */

/**
 * Check if a filename matches pattern(s)
 * @param {string} fileName - The filename to check
 * @param {string|string[]} patterns - Pattern or array of patterns (supports * and ?)
 * @returns {boolean} True if the filename matches any of the pattern(s)
 */
function matchesPattern(fileName, patterns) {
  const patternList = Array.isArray(patterns) ? patterns : [patterns];

  return patternList.some((pattern) => {
    // Match everything
    if (pattern === '*') {
      return true;
    }

    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/\./g, '\\.') // Escape dots
      .replace(/\*/g, '.*') // * matches any characters
      .replace(/\?/g, '.'); // ? matches single character

    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return regex.test(fileName);
  });
}

// Alias for backward compatibility
const matchesAnyPattern = matchesPattern;

module.exports = { matchesPattern, matchesAnyPattern };
