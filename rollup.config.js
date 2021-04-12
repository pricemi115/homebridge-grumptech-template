import nodePolyfills  from 'rollup-plugin-node-polyfills';
import json           from '@rollup/plugin-json';

export default {
  external: ['homebridge', 'crypto'],
  input: 'src/main.js',
  output: [
    {
      file: 'dist/homebridge-grumptech-template.js',
      format: 'cjs',
      exports: 'named'
    },
  ],
  plugins: [
    nodePolyfills(),
    json()
  ]
};
