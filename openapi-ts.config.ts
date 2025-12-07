import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  client: '@hey-api/client-fetch',
  input: 'http://localhost:8000/api/v1/openapi.json',
  output: {
    path: './src/app/core/api',
    format: 'prettier',
    lint: 'eslint',
  },
  services: {
    asClass: true,
  },
  types: {
    enums: 'javascript',
  },
});
