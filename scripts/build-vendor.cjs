'use strict';
require('esbuild').buildSync({ entryPoints: ['src/vendor-entry.js'], bundle: true, minify: true, outfile: 'src/renderer/vendor/bundle.js', platform: 'browser', target: 'chrome140' });
