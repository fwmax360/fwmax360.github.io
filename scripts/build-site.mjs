import {spawn} from 'node:child_process'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {resolve} from 'node:path'
import {inputSnapshot,invalidateStamp,sealBuild} from './lib/release-inputs.mjs'

function execute(root,args) {
  return new Promise((resolveRun,reject) => {
    const child = spawn(process.execPath,args,{cwd:root,env:{...process.env,ASTRO_TELEMETRY_DISABLED:'1'},stdio:'inherit'})
    child.once('error',reject)
    child.once('exit',(code,signal) => code === 0 ? resolveRun() : reject(new Error(`Build step failed (${signal ?? code}): ${args.join(' ')}`)))
  })
}

export async function buildSite(root,run = execute) {
  // A failed attempt must never leave an earlier successful stamp usable.
  await invalidateStamp(root)
  const startedAt = new Date().toISOString(), before = await inputSnapshot(root)
  await run(root,['scripts/gen-covers.mjs','--check'])
  await run(root,['node_modules/astro/bin/astro.mjs','build'])
  await run(root,['node_modules/pagefind/lib/runner/bin.cjs','--site','dist'])
  return sealBuild(root,before,startedAt)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const root = fileURLToPath(new URL('..',import.meta.url))
    const stamp = await buildSite(root)
    console.log(`Build recorded: ${Object.keys(stamp.inputs.files).length} inputs → ${Object.keys(stamp.build.files).length} output files`)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
