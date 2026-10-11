import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,mkdir,writeFile,readFile,rm,utimes} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {resolve} from 'node:path'
import {INPUT_SCOPE,inputSnapshot,sealBuild,verifyBuild,stampPath} from './lib/release-inputs.mjs'
import {buildSite} from './build-site.mjs'

async function fixture(run) {
  const root = await mkdtemp(resolve(tmpdir(),'blog-build-inputs-'))
  try {
    for (const item of INPUT_SCOPE) {
      if (item.endsWith('.json') || item.endsWith('.ts')) await writeFile(resolve(root,item),'{}')
      else { await mkdir(resolve(root,item),{recursive:true}); await writeFile(resolve(root,item,'fixture.txt'),item) }
    }
    await mkdir(resolve(root,'dist'))
    await writeFile(resolve(root,'dist/index.html'),'<h1>Fixture</h1>')
    await writeFile(resolve(root,'dist/search.js'),'search')
    await sealBuild(root,await inputSnapshot(root),new Date().toISOString())
    await run(root)
  } finally { await rm(root,{recursive:true,force:true}) }
}

test('Exact input and output inventories pass; touching unchanged bytes also passes',() => fixture(async root => {
  const result = await verifyBuild(root)
  assert.equal(Object.keys(result.inputs.files).length,INPUT_SCOPE.length)
  assert.equal(Object.keys(result.build.files).length,2)
  await utimes(resolve(root,'src/fixture.txt'),new Date(),new Date())
  assert.equal((await verifyBuild(root)).stampHash,result.stampHash)
}))

for (const input of ['tsconfig.json','astro.config.ts','package-lock.json','scripts/fixture.txt','.github/workflows/fixture.txt']) {
  test(`Changed ${input} fails even with backdated timestamp`,() => fixture(async root => {
    await writeFile(resolve(root,input),'changed')
    await utimes(resolve(root,input),new Date(0),new Date(0))
    await assert.rejects(verifyBuild(root),/inputs differ/)
  }))
}

test('Added and deleted source files both invalidate the build',() => fixture(async root => {
  await writeFile(resolve(root,'src/new.txt'),'new')
  await utimes(resolve(root,'src/new.txt'),new Date(0),new Date(0))
  await assert.rejects(verifyBuild(root),/inputs differ/)
  await rm(resolve(root,'src/new.txt'))
  await verifyBuild(root)
  await rm(resolve(root,'src/fixture.txt'))
  await assert.rejects(verifyBuild(root),/inputs differ/)
}))

test('Changed, deleted, or extra output files fail',() => fixture(async root => {
  const path = resolve(root,'dist/search.js')
  await writeFile(path,'different')
  await assert.rejects(verifyBuild(root),/output differs/)
  await writeFile(path,'search')
  await writeFile(resolve(root,'dist/stale.js'),'stale')
  await assert.rejects(verifyBuild(root),/output differs/)
  await rm(resolve(root,'dist/stale.js'))
  await rm(path)
  await assert.rejects(verifyBuild(root),/output differs/)
}))

test('Missing, invalid JSON, or incomplete stamp fails',() => fixture(async root => {
  const path = stampPath(root), original = await readFile(path,'utf8')
  await rm(path)
  await assert.rejects(verifyBuild(root),/Missing or unreadable/)
  await writeFile(path,'{')
  await assert.rejects(verifyBuild(root),/Missing or unreadable/)
  await writeFile(path,JSON.stringify({...JSON.parse(original),scope:['src']}))
  await assert.rejects(verifyBuild(root),/schema\/scope/)
  await writeFile(path,JSON.stringify({...JSON.parse(original),inputs:{hash:'forged'}}))
  await assert.rejects(verifyBuild(root),/inputs differ/)
}))

test('Successful orchestrator seals only after cover, Astro, and Pagefind steps',() => fixture(async root => {
  const steps = []
  await buildSite(root,async (cwd,args) => {
    assert.equal(cwd,root)
    await assert.rejects(readFile(stampPath(root)),/ENOENT/)
    steps.push(args)
  })
  assert.deepEqual(steps,[['scripts/gen-covers.mjs','--check'],['node_modules/astro/bin/astro.mjs','build'],['node_modules/pagefind/lib/runner/bin.cjs','--site','dist']])
  await verifyBuild(root)
}))

test('Each failed build step invalidates the previous stamp and stops later steps',() => fixture(async root => {
  for (let failure = 1; failure <= 3; failure++) {
    await sealBuild(root,await inputSnapshot(root),new Date().toISOString())
    let count = 0
    await assert.rejects(buildSite(root,async () => { if (++count === failure) throw new Error('step failure') }),/step failure/)
    assert.equal(count,failure)
    await assert.rejects(verifyBuild(root),/Missing or unreadable/)
  }
}))

test('Source drift during build leaves no stamp',() => fixture(async root => {
  await assert.rejects(buildSite(root,async (_cwd,args) => {
    if (args.includes('build')) await writeFile(resolve(root,'src/fixture.txt'),'changed during build')
  }),/Inputs changed during build/)
  await assert.rejects(verifyBuild(root),/Missing or unreadable/)
}))

test('Missing homepage prevents sealing',() => fixture(async root => {
  await assert.rejects(buildSite(root,async () => { await rm(resolve(root,'dist/index.html'),{force:true}) }),/missing dist\/index.html/)
  await assert.rejects(verifyBuild(root),/Missing or unreadable/)
}))
