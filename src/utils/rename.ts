import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error
}

async function updateTextFileIfExists(
  filePath: string,
  update: (content: string) => string,
): Promise<void> {
  try {
    const content = await readFile(filePath, "utf-8")
    await writeFile(filePath, update(content))
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return
    }
    throw error
  }
}

export async function renameProject(
  projectDir: string,
  projectName: string,
): Promise<void> {
  // 1. Update package.json name
  const pkgPath = join(projectDir, "package.json")
  const pkg = JSON.parse(await readFile(pkgPath, "utf-8"))
  pkg.name = projectName
  await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n")

  // 2. Update app.config.ts — app identity and email sender name
  const configPath = join(projectDir, "app.config.ts")
  let config = await readFile(configPath, "utf-8")

  // Replace app.name (word-boundary ensures we don't match fromName, legalName, etc.)
  config = config.replace(/(\bname:\s*")([^"]*?)(")/, `$1${projectName}$3`)

  // Replace app.legalName
  config = config.replace(/(legalName:\s*")([^"]*?)(")/, `$1${projectName}$3`)

  // Replace email.fromName
  config = config.replace(/(fromName:\s*")([^"]*?)(")/, `$1${projectName}$3`)

  await writeFile(configPath, config)

  // 3. Update environment and local service defaults
  const envExamplePath = join(projectDir, ".env.example")
  await updateTextFileIfExists(envExamplePath, (envExample) =>
    envExample
      .replace(
        /^DATABASE_URL=.*/m,
        `DATABASE_URL=postgresql://${projectName}:${projectName}@localhost:5432/${projectName}`,
      )
      .replace(/^MAIL_FROM=.*/m, `MAIL_FROM=${projectName} <noreply@example.com>`)
      .replace(/^S3_ACCESS_KEY=.*/m, `S3_ACCESS_KEY=${projectName}`)
      .replace(/^S3_SECRET_KEY=.*/m, `S3_SECRET_KEY=${projectName}-secret`)
      .replace(/^S3_BUCKET=.*/m, `S3_BUCKET=${projectName}`),
  )

  for (const composeFile of ["docker-compose.yml", "docker-compose.yaml"]) {
    const composePath = join(projectDir, composeFile)
    await updateTextFileIfExists(composePath, (compose) =>
      compose
        .replaceAll("scaffo-secret", `${projectName}-secret`)
        .replaceAll("scaffo-dev-jwt-secret", `${projectName}-dev-jwt-secret`)
        .replaceAll("noreply@scaffo.dev", `noreply@${projectName}.dev`)
        .replaceAll("scaffo", projectName),
    )
  }

  const storageEnvPath = join(projectDir, "packages/storage/src/env.ts")
  await updateTextFileIfExists(storageEnvPath, (storageEnv) =>
    storageEnv
      .replace(
        /S3_ACCESS_KEY:\s*z\.string\(\)\.default\("[^"]*"\)/,
        `S3_ACCESS_KEY: z.string().default("${projectName}")`,
      )
      .replace(
        /S3_SECRET_KEY:\s*z\.string\(\)\.default\("[^"]*"\)/,
        `S3_SECRET_KEY: z.string().default("${projectName}-secret")`,
      )
      .replace(
        /S3_BUCKET:\s*z\.string\(\)\.default\("[^"]*"\)/,
        `S3_BUCKET: z.string().default("${projectName}")`,
      ),
  )

  // 4. Generate a clean README.md for the new project
  const readmePath = join(projectDir, "README.md")
  const readme = `# ${projectName}

Built with [scaffo](https://github.com/typerobot/scaffo) — an opinionated AI agent harness SaaS boilerplate.

## Getting Started

\`\`\`bash
cp .env.example .env        # Edit with your settings
pnpm services:up            # Start Postgres, Redis, etc.
pnpm db:migrate && pnpm db:seed
pnpm run build              # Build all packages and apps
pnpm dev                    # Start dev server
\`\`\`

## Scripts

| Script | Description |
|--------|-------------|
| \`pnpm dev\` | Start all dev servers |
| \`pnpm build\` | Build all packages and apps |
| \`pnpm lint\` | Lint with oxlint |
| \`pnpm format\` | Format with oxfmt |
| \`pnpm typecheck\` | TypeScript type checking |
| \`pnpm test\` | Run unit tests |
| \`pnpm test:e2e\` | Run e2e tests |
`
  await writeFile(readmePath, readme)
}
