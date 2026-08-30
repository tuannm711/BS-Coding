import { expect, it } from 'vitest'
import { openV2Database } from '../../../src/main/v2/infrastructure/persistence/database'
import { SqliteUnitOfWork } from '../../../src/main/v2/infrastructure/persistence/sqlite-unit-of-work'

it('rolls back all writes when an async command fails', async () => {
  const db = openV2Database(':memory:')
  try {
    db.exec('CREATE TABLE values_table(value TEXT NOT NULL)')
    const unit = new SqliteUnitOfWork(db)
    await expect(unit.run(async () => {
      db.prepare('INSERT INTO values_table VALUES (?)').run('first')
      await Promise.resolve()
      db.prepare('INSERT INTO values_table VALUES (?)').run('second')
      throw new Error('fail command')
    })).rejects.toThrow('fail command')
    expect(db.prepare('SELECT value FROM values_table').all()).toEqual([])
  } finally {
    db.close()
  }
})

it('reuses a transaction for nested services and serializes concurrent commands', async () => {
  const db = openV2Database(':memory:')
  try {
    db.exec('CREATE TABLE values_table(value TEXT NOT NULL)')
    const unit = new SqliteUnitOfWork(db)
    const order: string[] = []
    await Promise.all([
      unit.run(async () => {
        order.push('first-start')
        await unit.run(async () => { db.prepare('INSERT INTO values_table VALUES (?)').run('nested') })
        await Promise.resolve()
        order.push('first-end')
      }),
      unit.run(async () => { order.push('second'); db.prepare('INSERT INTO values_table VALUES (?)').run('second') })
    ])
    expect(order).toEqual(['first-start', 'first-end', 'second'])
    expect(db.prepare('SELECT value FROM values_table ORDER BY rowid').all())
      .toEqual([{ value: 'nested' }, { value: 'second' }])
  } finally {
    db.close()
  }
})

it('releases the command queue when beginning a transaction fails', async () => {
  let firstBegin = true
  const commands: string[] = []
  const db = { exec(sql: string) {
    commands.push(sql)
    if (sql === 'BEGIN IMMEDIATE' && firstBegin) { firstBegin = false; throw new Error('busy') }
  } }
  const unit = new SqliteUnitOfWork(db as never)
  await expect(unit.run(async () => 'first')).rejects.toThrow('busy')
  const second = await Promise.race([
    unit.run(async () => 'second'),
    new Promise<string>(resolve => setTimeout(() => resolve('timed-out'), 50))
  ])
  expect(second).toBe('second')
})
