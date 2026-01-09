// Usage:
// mongosh "mongodb://user:pass@host:27017/dbname" service/scripts/dedupe-prompts.mongosh.js -- --dry-run

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const dbName = db.getName()

function dedupeBuiltInPrompt() {
  const duplicates = db.built_in_prompt.aggregate([
    { $group: { _id: '$title', ids: { $push: '$_id' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ]).toArray()

  let deleteCount = 0
  duplicates.forEach((dup) => {
    const ids = dup.ids.sort((a, b) => a.toString().localeCompare(b.toString()))
    const keepId = ids[ids.length - 1]
    const toDelete = ids.filter(id => id.toString() !== keepId.toString())
    if (toDelete.length > 0) {
      const deleteDocs = db.built_in_prompt.find({ _id: { $in: toDelete } }).toArray()
      print('[built_in_prompt] delete candidates:')
      printjson(deleteDocs)
      if (!dryRun)
        db.built_in_prompt.deleteMany({ _id: { $in: toDelete } })
      deleteCount += toDelete.length
    }
  })

  print(`[built_in_prompt] duplicate groups: ${duplicates.length}, deleted: ${deleteCount}`)
}

function dedupeUserPrompt() {
  const duplicates = db.user_prompt.aggregate([
    { $group: { _id: { userId: '$userId', title: '$title' }, ids: { $push: '$_id' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ]).toArray()

  let deleteCount = 0
  duplicates.forEach((dup) => {
    const ids = dup.ids.sort((a, b) => a.toString().localeCompare(b.toString()))
    const keepId = ids[ids.length - 1]
    const toDelete = ids.filter(id => id.toString() !== keepId.toString())
    if (toDelete.length > 0) {
      const deleteDocs = db.user_prompt.find({ _id: { $in: toDelete } }).toArray()
      print('[user_prompt] delete candidates:')
      printjson(deleteDocs)
      if (!dryRun)
        db.user_prompt.deleteMany({ _id: { $in: toDelete } })
      deleteCount += toDelete.length
    }
  })

  print(`[user_prompt] duplicate groups: ${duplicates.length}, deleted: ${deleteCount}`)
}

print(`Using database: ${dbName}`)
dedupeBuiltInPrompt()
dedupeUserPrompt()
if (dryRun)
  print('Dry run only; no data was deleted.')
