import {createHash} from 'node:crypto'
import {readFile,readdir,mkdir,rename,writeFile,rm} from 'node:fs/promises'
import {resolve,relative} from 'node:path'

// Deliberately conservative: test/build scripts and workflow changes also require a rebuild.
export const INPUT_SCOPE = ['src','public','scripts','.github/workflows','astro.config.ts','tsconfig.json','package.json','package-lock.json']
export const digest = bytes => createHash('sha256').update(bytes).digest('hex')
export const stampPath = root => resolve(root,'artifacts/build-inputs/current.json')

async function collect(path) {
  const entries = await readdir(path,{withFileTypes:true})
  const paths = []
  for (const entry of entries) {
    const child = resolve(path,entry.name)
    if (entry.isDirectory()) paths.push(...await collect(child))
    else if (entry.isFile()) paths.push(child)
    else throw new Error(`Unsupported build input type: ${child}`)
  }
  return paths
}

async function snapshot(root,paths) {
  const files = {}
  for (const path of paths.sort()) files[relative(root,path).split('\\').join('/')] = digest(await readFile(path))
  return {hash:digest(JSON.stringify(files)),files}
}

export async function inputSnapshot(root) {
  const paths = []
  for (const item of INPUT_SCOPE) {
    const path = resolve(root,item)
    if (item.includes('.json') || item.endsWith('.ts')) paths.push(path)
    else paths.push(...await collect(path))
  }
  return snapshot(root,paths)
}

export async function buildSnapshot(root) {
  return snapshot(root,await collect(resolve(root,'dist')))
}

export async function invalidateStamp(root) {
  await rm(stampPath(root),{force:true})
}

export async function sealBuild(root,before,startedAt) {
  const inputs = await inputSnapshot(root)
  if (inputs.hash !== before.hash) throw new Error('Inputs changed during build; rebuild from one stable state')
  const build = await buildSnapshot(root)
  if (!build.files['dist/index.html']) throw new Error('Build is missing dist/index.html')
  const stamp = {schema:1,scope:INPUT_SCOPE,startedAt,finishedAt:new Date().toISOString(),runtime:process.version,inputs,build}
  const path = stampPath(root)
  await mkdir(resolve(root,'artifacts/build-inputs'),{recursive:true})
  const temporary = `${path}.${process.pid}.tmp`
  try {
    await writeFile(temporary,JSON.stringify(stamp,null,2)+'\n')
    await rename(temporary,path)
  } finally {
    await rm(temporary,{force:true})
  }
  return stamp
}

export async function verifyBuild(root) {
  let stamp
  try { stamp = JSON.parse(await readFile(stampPath(root),'utf8')) }
  catch { throw new Error('Missing or unreadable build stamp; run npm run build') }
  if (stamp.schema !== 1 || JSON.stringify(stamp.scope) !== JSON.stringify(INPUT_SCOPE)) throw new Error('Build stamp schema/scope differs; run npm run build')
  const inputs = await inputSnapshot(root), build = await buildSnapshot(root)
  if (JSON.stringify(stamp.inputs) !== JSON.stringify(inputs)) throw new Error('Build inputs differ from current source/configuration; run npm run build')
  if (JSON.stringify(stamp.build) !== JSON.stringify(build)) throw new Error('Build output differs from its recorded snapshot; run npm run build')
  if (!build.files['dist/index.html']) throw new Error('Build is missing dist/index.html')
  return {inputs,build,stamp,stampHash:digest(await readFile(stampPath(root)))}
}
