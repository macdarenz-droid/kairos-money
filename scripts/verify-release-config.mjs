import { readFileSync } from 'node:fs'

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const packageLock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'))
const gradle = readFileSync(new URL('../android/app/build.gradle', import.meta.url), 'utf8')
const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8')

const version = packageJson.version
const failures = []
const requireMatch = (condition, message) => {
  if (!condition) failures.push(message)
}

requireMatch(version === packageLock.version, 'package.json and package-lock.json versions differ')
requireMatch(version === packageLock.packages?.['']?.version, 'root package-lock version differs')
requireMatch(gradle.includes(`versionName "${version}"`), 'Android versionName differs from package version')
requireMatch(/versionCode\s+4\b/.test(gradle), 'Android release-candidate versionCode must be 4')
requireMatch(changelog.includes(`## ${version} —`), 'CHANGELOG has no entry for the package version')

for (const key of [
  'KAIROS_RELEASE_STORE_FILE',
  'KAIROS_RELEASE_STORE_PASSWORD',
  'KAIROS_RELEASE_KEY_ALIAS',
  'KAIROS_RELEASE_KEY_PASSWORD',
]) {
  requireMatch(gradle.includes(key), `Android release signing does not require ${key}`)
}

requireMatch(gradle.includes("task.name == 'preReleaseBuild'"), 'Release signing verification is not attached to preReleaseBuild')
requireMatch(gradle.includes("throw new GradleException('Private release signing is not configured."), 'Missing release credentials do not fail closed')
requireMatch(!/signingConfig\s+signingConfigs\.debug/.test(gradle), 'Release build falls back to the debug signing identity')
requireMatch(/benchmark\s*\{\s*initWith release\s+debuggable false\s+signingConfig signingConfigs\.getByName\('debug'\)\s+matchingFallbacks = \['release'\]\s*\}/.test(gradle), 'Benchmark must inherit release behavior, disable debugging and use only the CI debug identity')

if (failures.length > 0) {
  throw new Error(`Private release configuration failed:\n- ${failures.join('\n- ')}`)
}

console.log(JSON.stringify({ status: 'PASS', version, versionCode: 4, signing: 'secret-backed; no debug fallback' }))
