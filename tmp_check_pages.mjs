import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

const pages = fs.readdirSync('src/pages').filter(f => /\.(jsx|tsx|js|ts)$/.test(f));
const broken = [];
const ok = [];

for (const p of pages) {
  const fpath = `src/pages/${p}`;
  try {
    await esbuild.build({
      entryPoints: [fpath],
      bundle: true,
      write: false,
      platform: 'browser',
      jsx: 'automatic',
      loader: { '.js': 'jsx' },
      alias: { '@': path.resolve('./src') },
      logLevel: 'silent',
      external: [
        'react', 'react-dom', 'react-router-dom', '*.css', '*.svg', '*.png',
        '@base44/sdk', '@radix-ui/*', 'lucide-react', 'framer-motion',
        'recharts', 'date-fns', 'lodash', 'clsx', 'class-variance-authority',
        'react-hook-form', '@hookform/resolvers', 'zod', 'sonner',
        'react-markdown', 'embla-carousel-react', 'cmdk', 'vaul',
        'tailwind-merge', 'next-themes', 'react-day-picker', '@tanstack/react-query',
        'input-otp', 'react-resizable-panels', 'react-hot-toast',
        '@stripe/*', 'three', 'moment',
      ],
    });
    ok.push(p);
  } catch (e) {
    broken.push({ page: p, error: e.message.slice(0, 200) });
  }
}

console.log(`Total: ${pages.length} | OK: ${ok.length} | QUEBRADAS: ${broken.length}`);
fs.writeFileSync('/tmp/broken_pages_real.json', JSON.stringify(broken.map(b => b.page)));
fs.writeFileSync('/tmp/broken_pages_detail.json', JSON.stringify(broken, null, 2));
console.log('\nPrimeiras 10 quebradas:');
for (const b of broken.slice(0, 10)) {
  console.log(`  ${b.page}: ${b.error.split('\n')[0]}`);
}
