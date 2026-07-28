#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');
const inputPath = path.join(backendRoot, 'prisma', 'schema.prisma');
const outputPath = path.resolve(backendRoot, process.argv[2] || 'prisma/schema.runtime.prisma');

const source = fs.readFileSync(inputPath, 'utf8');
const runtimeDatasource = `datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}`;

const rewritten = source
  .replace(/^\/\/ This is the single source of truth[\s\S]*?\/\/ Enums are stored as String for SQLite compatibility[^\n]*\n\n/, '')
  .replace(/datasource db \{[\s\S]*?\}/, runtimeDatasource);

const header = `// Generated from prisma/schema.prisma for production PostgreSQL runtime use.
// Do not edit by hand; run scripts/generate-runtime-prisma-schema.mjs.
// The application intentionally keeps SQLite-compatible scalar fields here.

`;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${header}${rewritten}`);
console.log(`Generated ${path.relative(backendRoot, outputPath)}`);
