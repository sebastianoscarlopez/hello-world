import resolve from '@rollup/plugin-node-resolve';

export default {
  input: 'examples/web-ifc-three/maplibre/app.js',
  output: [
    {
      format: 'esm',
      file: 'examples/web-ifc-three/maplibre/bundle.js'
    },
  ],
  plugins: [
    resolve(),
  ]
};