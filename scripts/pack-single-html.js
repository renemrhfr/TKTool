const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const inputPath = path.join(root, 'index.html');
const outputPath = path.join(root, 'TKTool.html');

function readLocalAsset(assetPath) {
  const normalizedPath = assetPath.replace(/^\.\//, '');
  if (normalizedPath.startsWith('/') || normalizedPath.includes('://')) {
    throw new Error(`Only local relative assets can be packed: ${assetPath}`);
  }

  const fullPath = path.resolve(root, normalizedPath);
  if (!fullPath.startsWith(root + path.sep)) {
    throw new Error(`Asset path escapes repository root: ${assetPath}`);
  }

  return fs.readFileSync(fullPath, 'utf8');
}

const html = fs.readFileSync(inputPath, 'utf8');

let packed = html.replace(
  /<link\s+rel=["']stylesheet["']\s+href=["']([^"']+)["']\s*>/g,
  (_, href) => {
    const css = readLocalAsset(href);
    return `<style data-source="${href}">\n${css}\n</style>`;
  }
);

packed = packed.replace(
  /<script\s+src=["']([^"']+)["']>\s*<\/script>/g,
  (_, src) => {
    const js = readLocalAsset(src);
    return `<script data-source="${src}">\n${js}\n</script>`;
  }
);

fs.writeFileSync(outputPath, packed);

console.log(`Packed ${path.relative(root, outputPath)}`);
