#!/usr/bin/env node

/**
 * Simple script to help identify circular dependencies
 */
const path = require("path");
const fs = require("fs");

function scanForImports(file, basePath) {
  const content = fs.readFileSync(path.join(basePath, file), "utf8");
  const imports = [];

  // Match import statements
  const importRegex =
    /import\s+(?:{[^}]+}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/g;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1];
    // Only consider local imports, not npm packages
    if (importPath.startsWith("./") || importPath.startsWith("../")) {
      // Convert to absolute path
      let resolvedPath = path.resolve(
        path.dirname(path.join(basePath, file)),
        importPath
      );

      // Try to find the file with extensions
      const extensions = [".ts", ".tsx", ".js", ".jsx"];
      let found = false;

      for (const ext of extensions) {
        if (fs.existsSync(`${resolvedPath}${ext}`)) {
          resolvedPath = `${resolvedPath}${ext}`;
          found = true;
          break;
        }
      }

      // Try index file
      if (!found) {
        for (const ext of extensions) {
          if (fs.existsSync(path.join(resolvedPath, `index${ext}`))) {
            resolvedPath = path.join(resolvedPath, `index${ext}`);
            found = true;
            break;
          }
        }
      }

      // Make path relative to base path
      if (found) {
        imports.push(path.relative(basePath, resolvedPath));
      }
    }
  }

  return imports;
}

function findCircularDeps(file, basePath, visited = [], path = []) {
  const normalizedFile = file.replace(/\\/g, "/");

  // Check for circular dependency
  if (path.includes(normalizedFile)) {
    console.log("CIRCULAR DEPENDENCY DETECTED:");
    console.log([...path, normalizedFile].join(" -> "));
    return true;
  }

  // Skip if already visited
  if (visited.includes(normalizedFile)) {
    return false;
  }

  visited.push(normalizedFile);
  const newPath = [...path, normalizedFile];

  // Get imports
  try {
    const imports = scanForImports(normalizedFile, basePath);

    // Check each import for circular deps
    for (const importFile of imports) {
      if (findCircularDeps(importFile, basePath, visited, newPath)) {
        return true;
      }
    }
  } catch (err) {
    console.error(`Error scanning file ${normalizedFile}:`, err.message);
  }

  return false;
}

// Main function
function main() {
  const baseDir = path.resolve(__dirname, "..");
  const srcDir = path.join(baseDir, "src");

  console.log("Scanning for circular dependencies...");
  console.log(`Base directory: ${baseDir}`);

  // Get all TypeScript files in the src directory
  const files = [];
  function scanDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
        files.push(path.relative(baseDir, fullPath));
      }
    }
  }

  scanDir(srcDir);
  console.log(`Found ${files.length} TypeScript files to check`);

  let foundCircular = false;
  for (const file of files) {
    if (findCircularDeps(file, baseDir)) {
      foundCircular = true;
      break;
    }
  }

  if (!foundCircular) {
    console.log("No circular dependencies found!");
  }
}

main();
