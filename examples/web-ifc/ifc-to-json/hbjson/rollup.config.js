import resolve from '@rollup/plugin-node-resolve';

export default {
  input: './examples/web-ifc/ifc-to-json/hbjson/app.js',
  output: [
    {
      format: 'esm',
      file: './examples/web-ifc/ifc-to-json/hbjson/bundle.js'
    },
  ],
  plugins: [
    resolve(),
  ]
};