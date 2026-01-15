/**
 * Copilot File Generator Service
 * Generates Copilot prompt and agent files by inlining referenced content
 *
 * Copilot doesn't resolve file references in prompts, so we inline
 * the full content at install time.
 */
const fs = require('fs').promises;
const path = require('path');
const { log } = require('../utils/logger');

const INLINE_PATTERN = /\{\{INLINE:([^}]+)\}\}/g;

/**
 * Remove YAML frontmatter from markdown content
 * @param {string} content - Markdown content with potential frontmatter
 * @returns {string} Content without frontmatter
 */
function removeFrontmatter(content) {
  const frontmatterMatch = content.match(/^---\n[\s\S]*?\n---\n/);
  if (frontmatterMatch) {
    return content.slice(frontmatterMatch[0].length);
  }
  return content;
}

/**
 * Generate files by inlining {{INLINE:path}} markers with file content
 * @param {Object} config - Generation configuration
 * @param {string} config.packageRoot - Root directory of the AWOS package
 * @param {string} config.sourceDir - Source directory relative to packageRoot
 * @param {string} config.outputDir - Output directory (absolute path)
 * @param {string} config.filePattern - File extension pattern to match (e.g., '.prompt.md')
 * @param {boolean} config.dryRun - Whether to run in dry-run mode
 * @returns {Promise<Object>} Statistics: { generated, skipped }
 */
async function generateFiles({
  packageRoot,
  sourceDir,
  outputDir,
  filePattern,
  dryRun = false,
}) {
  const fullSourceDir = path.join(packageRoot, sourceDir);
  const stats = { generated: 0, skipped: 0 };

  // Ensure output directory exists
  if (!dryRun) {
    await fs.mkdir(outputDir, { recursive: true });
  }

  // Read all template files
  let files;
  try {
    files = await fs.readdir(fullSourceDir);
  } catch (err) {
    log(`Source directory not found: ${fullSourceDir}`, 'error');
    return stats;
  }

  const templateFiles = files.filter((f) => f.endsWith(filePattern));

  for (const file of templateFiles) {
    const templatePath = path.join(fullSourceDir, file);
    let content = await fs.readFile(templatePath, 'utf8');

    // Replace all {{INLINE:path}} markers with file content
    const matches = [...content.matchAll(INLINE_PATTERN)];

    for (const match of matches) {
      const relativePath = match[1];
      const inlinePath = path.join(packageRoot, relativePath);

      try {
        const inlineContent = await fs.readFile(inlinePath, 'utf8');
        // Remove frontmatter from inlined content (keep only body)
        const bodyContent = removeFrontmatter(inlineContent);
        content = content.replace(match[0], bodyContent);
      } catch (err) {
        log(`Failed to inline ${relativePath}: ${err.message}`, 'error');
        stats.skipped++;
        continue;
      }
    }

    // Write generated file
    if (!dryRun) {
      const outputPath = path.join(outputDir, file);
      await fs.writeFile(outputPath, content, 'utf8');
      log(`Generated ${file}`, 'success');
    }

    stats.generated++;
  }

  return stats;
}

/**
 * Generate Copilot prompt files by inlining command content
 * @param {Object} config - Generation configuration
 * @param {string} config.packageRoot - Root directory of the AWOS package
 * @param {string} config.targetDir - Target directory for generated files
 * @param {boolean} config.dryRun - Whether to run in dry-run mode
 * @returns {Promise<Object>} Statistics: { generated, skipped }
 */
async function generatePrompts({ packageRoot, targetDir, dryRun = false }) {
  return generateFiles({
    packageRoot,
    sourceDir: 'copilot/prompts',
    outputDir: path.join(targetDir, '.github/prompts'),
    filePattern: '.prompt.md',
    dryRun,
  });
}

module.exports = { generatePrompts };
