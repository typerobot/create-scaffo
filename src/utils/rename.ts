import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

export async function renameProject(
  projectDir: string,
  projectName: string,
): Promise<void> {
  // 1. Update package.json name
  const pkgPath = join(projectDir, "package.json")
  const pkg = JSON.parse(await readFile(pkgPath, "utf-8"))
  pkg.name = projectName
  await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n")

  // 2. Update app.config.ts — both app.name and email.fromName
  const configPath = join(projectDir, "app.config.ts")
  let config = await readFile(configPath, "utf-8")

  // Replace app.name (word-boundary ensures we don't match fromName, legalName, etc.)
  config = config.replace(/(\bname:\s*")([^"]*?)(")/, `$1${projectName}$3`)

  // Replace email.fromName
  config = config.replace(/(fromName:\s*")([^"]*?)(")/, `$1${projectName}$3`)

  await writeFile(configPath, config)

  // 3. Generate a clean README.md for the new project
  const readmePath = join(projectDir, "README.md")
  const readme = `# ${projectName}

Built with [scaffo](https://github.com/typerobot/scaffo) — an opinionated AI SaaS starter kit.

## Getting Started

\`\`\`bash
cp .env.example .env        # Edit with your settings
pnpm services:up            # Start Postgres, Redis, etc.
pnpm db:migrate && pnpm db:seed
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
