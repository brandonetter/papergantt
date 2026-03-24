import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const generateBMFont = require('msdf-bmfont-xml');

function usage() {
  console.error('Usage: node scripts/generate-msdf-font.mjs <font-file> <output-base>');
  process.exit(1);
}

function toManifest(source, imageName) {
  return {
    name: source.info.face,
    mode: source.distanceField?.fieldType === 'msdf' ? 'msdf' : 'alpha',
    atlas: {
      image: imageName,
      width: source.common.scaleW,
      height: source.common.scaleH,
      pxRange: source.distanceField?.distanceRange ?? 4,
    },
    metrics: {
      lineHeight: source.common.lineHeight,
      ascender: source.common.base,
      descender: source.common.lineHeight - source.common.base,
    },
    glyphs: source.chars.map((glyph) => ({
      codepoint: glyph.id,
      advance: glyph.xadvance,
      planeBounds: [
        glyph.xoffset,
        source.common.base - glyph.yoffset - glyph.height,
        glyph.xoffset + glyph.width,
        source.common.base - glyph.yoffset,
      ],
      atlasBounds: [
        glyph.x / source.common.scaleW,
        glyph.y / source.common.scaleH,
        (glyph.x + glyph.width) / source.common.scaleW,
        (glyph.y + glyph.height) / source.common.scaleH,
      ],
    })),
    kerning: (source.kernings ?? []).map((entry) => [entry.first, entry.second, entry.amount]),
  };
}

function generateFont(fontPath, outputBase) {
  return new Promise((resolve, reject) => {
    generateBMFont(
      fontPath,
      {
        outputType: 'json',
        fontSize: 56,
        textureSize: [1024, 1024],
        texturePadding: 2,
        distanceRange: 6,
        fieldType: 'msdf',
        smartSize: true,
        pot: true,
        square: true,
      },
      (error, textures, font) => {
        if (error) {
          reject(error);
          return;
        }
        resolve({ textures, font });
      },
    );
  });
}

const [fontPath, outputBase] = process.argv.slice(2);

if (!fontPath || !outputBase) {
  usage();
}

const outputDir = path.dirname(outputBase);
const outputName = path.basename(outputBase);
const outputImage = `${outputName}.png`;
const outputManifest = `${outputName}.json`;

const { textures, font } = await generateFont(fontPath, outputBase);
if (textures.length !== 1) {
  throw new Error(`Expected a single atlas page, received ${textures.length}.`);
}

const source = JSON.parse(font.data);
const manifest = toManifest(source, outputImage);

await mkdir(outputDir, { recursive: true });
await writeFile(path.join(outputDir, outputImage), textures[0].texture);
await writeFile(path.join(outputDir, outputManifest), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
