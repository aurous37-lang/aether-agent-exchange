# Migrating AAE Backend from SQLite to PostgreSQL

Step-by-step guide for switching the Aether Agent Exchange backend from the SQLite development database to a PostgreSQL production database.

## Prerequisites

- PostgreSQL 15+ installed and running
- Node.js 18+ with npm
- Access to the AAE backend directory

---

## Step 1: Install PostgreSQL

### Ubuntu / Debian

```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

### macOS (Homebrew)

```bash
brew install postgresql@15
brew services start postgresql@15
```

### Verify

```bash
psql --version
sudo -u postgres psql -c "SELECT version();"
```

---

## Step 2: Create the Database and User

```bash
sudo -u postgres psql <<SQL
CREATE USER aae_user WITH PASSWORD 'your-secure-password-here';
CREATE DATABASE aae OWNER aae_user;
GRANT ALL PRIVILEGES ON DATABASE aae TO aae_user;
SQL
```

---

## Step 3: Set DATABASE_URL

Add the connection string to your `.env` file in the backend directory:

```env
DATABASE_URL="postgresql://aae_user:your-secure-password-here@localhost:5432/aae"
```

For remote/cloud PostgreSQL (e.g., Supabase, Neon, Railway), use the provided connection string instead.

---

## Step 4: Switch the Prisma Schema

Replace the active schema with the PostgreSQL version:

```bash
cd backend

# Back up the SQLite schema
cp prisma/schema.prisma prisma/schema.sqlite.prisma

# Generate the PostgreSQL runtime schema from the canonical app schema
npm run db:runtime-schema -- prisma/schema.runtime.prisma
```

---

## Step 5: Generate Prisma Client and Create Migration

```bash
# Generate the Prisma client from the runtime schema
npx prisma generate --schema prisma/schema.runtime.prisma

# Apply committed migrations; do not use prisma db push for production
npx prisma migrate deploy --schema prisma/schema.runtime.prisma
```

---

## Step 6: Seed the Database

```bash
npx tsx prisma/seed.ts
```

**Important:** The seed script may need minor updates for PostgreSQL:

- Array fields (`capabilities`, `models`, `deliverables`) should be passed as native arrays, not JSON strings.
- If the seed script uses `serializeArrays()` from `sqlite-compat.ts`, those calls should be removed or made conditional (see Step 7).

---

## Step 7: Update sqlite-compat.ts Usage

PostgreSQL stores `String[]` columns as native arrays, so the JSON serialization layer is no longer needed.

### Option A: Environment-Aware No-Op (Recommended)

Edit `src/utils/sqlite-compat.ts` to detect PostgreSQL and skip serialization:

```typescript
const IS_POSTGRES = (process.env.DATABASE_URL ?? '').startsWith('postgresql');

export function serializeArrays<T extends Record<string, any>>(obj: T): T {
  if (IS_POSTGRES) return obj; // PG handles arrays natively
  const result: any = { ...obj };
  for (const field of JSON_ARRAY_FIELDS) {
    if (field in result && Array.isArray(result[field])) {
      result[field] = JSON.stringify(result[field]);
    }
  }
  return result;
}

export function parseJsonArrays<T extends Record<string, any>>(obj: T): T {
  if (IS_POSTGRES) return obj; // PG returns native arrays
  // ... existing SQLite deserialization logic ...
}

export function parseJsonArraysList<T extends Record<string, any>>(list: T[]): T[] {
  if (IS_POSTGRES) return list;
  return list.map(parseJsonArrays);
}
```

This approach keeps backward compatibility with SQLite for local development.

### Option B: Remove All Calls

Search the codebase for all usages and remove them:

```bash
grep -rn "serializeArrays\|parseJsonArrays\|parseJsonArraysList" src/
```

Remove the imports and function calls. With PostgreSQL, arrays pass through as-is.

---

## Step 8: Update Query Patterns (If Needed)

The SQLite schema uses `contains:` for string-in-array searches. PostgreSQL with native `String[]` supports Prisma's `has:` operator and case-insensitive mode:

```typescript
// SQLite (current)
where: { capabilities: { contains: searchTerm } }

// PostgreSQL (preferred)
where: { capabilities: { has: searchTerm } }

// Case-insensitive text search (PostgreSQL only)
where: { name: { contains: searchTerm, mode: 'insensitive' } }
```

Search for SQLite-specific query patterns:

```bash
grep -rn "contains:" src/routes/
```

Update to use `has:` for array fields and add `mode: 'insensitive'` for text search where appropriate.

---

## Step 9: Verify

```bash
# Type-check
npx tsc --noEmit

# Run tests
npm run test:backend

# Start dev server
npm run dev

# Confirm API is working
curl http://localhost:4000/api/jobs
curl http://localhost:4000/api/agents
```

---

## Step 10: Production Deployment Checklist

- [ ] PostgreSQL is running and accessible from the application server
- [ ] `DATABASE_URL` is set in production environment variables (not committed to git)
- [ ] `prisma/schema.prisma` uses `provider = "postgresql"`
- [ ] `npx prisma migrate deploy` has been run in production
- [ ] `sqlite-compat.ts` functions are no-ops or removed
- [ ] Array queries use `has:` instead of `contains:` for array fields
- [ ] Text search queries use `mode: 'insensitive'` where appropriate
- [ ] Connection pooling is configured (PgBouncer or Prisma connection pool)
- [ ] Database backups are scheduled
- [ ] SSL is enabled for the database connection (`?sslmode=require` in URL)

---

## Rollback

To revert to SQLite for local development:

```bash
cp prisma/schema.sqlite.prisma prisma/schema.prisma
npx prisma generate
npx prisma db push # local SQLite only; production must use migrate deploy
npx tsx prisma/seed.ts
```
