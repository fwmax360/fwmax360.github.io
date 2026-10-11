import {fileURLToPath} from 'node:url'
import {verifyBuild} from './lib/release-inputs.mjs'
try {
  const verified = await verifyBuild(fileURLToPath(new URL('..',import.meta.url)))
  console.log(`Build provenance matches: ${Object.keys(verified.inputs.files).length} inputs, ${Object.keys(verified.build.files).length} outputs`)
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
