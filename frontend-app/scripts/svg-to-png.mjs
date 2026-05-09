import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync } from 'node:fs';

const [, , inputPath, outputPath, sizeArg, bgArg] = process.argv;
if (!inputPath || !outputPath) {
  console.error('Usage: node svg-to-png.mjs <input.svg> <output.png> [size=1024] [bg=transparent|#fff]');
  process.exit(1);
}
const size = parseInt(sizeArg || '1024', 10);
const background = !bgArg || bgArg === 'transparent' ? undefined : bgArg;

const svg = readFileSync(inputPath, 'utf8');
const resvg = new Resvg(svg, {
  fitTo: { mode: 'width', value: size },
  ...(background ? { background } : {}),
});
writeFileSync(outputPath, resvg.render().asPng());
console.log(`Wrote ${outputPath} (${size}x${size})`);
