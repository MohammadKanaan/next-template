// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { SessionUser } from '@/lib/data/auth'
import { ForbiddenError } from '@/lib/data/errors'
import { authorize, permissionsFor, type Rule } from '@/lib/data/policy'

type Note = { ownerId: string; locked: boolean }

const isOwner: Rule<Note> = (viewer, note) => viewer !== null && viewer.id === note.ownerId
const isUnlocked: Rule<Note> = (_viewer, note) => !note.locked
const notePolicy = { edit: isOwner, read: isUnlocked }

const owner: SessionUser = { id: 'u1', role: 'user', sessionId: 's1', impersonatedBy: null }
const note: Note = { ownerId: 'u1', locked: true }

describe('authorize', () => {
  it('returns when the rule allows the viewer', () => {
    expect(() => authorize(isOwner, owner, note)).not.toThrow()
  })

  it('throws ForbiddenError with the default message when it does not', () => {
    expect(() => authorize(isOwner, null, note)).toThrow(ForbiddenError)
    expect(() => authorize(isOwner, null, note)).toThrow('You are not allowed to do that')
  })

  it('throws with a custom message', () => {
    expect(() => authorize(isOwner, null, note, 'Not yours')).toThrow('Not yours')
  })
})

describe('permissionsFor', () => {
  it('returns exactly the listed actions as booleans for the viewer', () => {
    expect(permissionsFor(notePolicy, ['edit'], owner, note)).toEqual({ edit: true })
    expect(permissionsFor(notePolicy, ['edit', 'read'], owner, note)).toEqual({
      edit: true,
      read: false,
    })
    expect(permissionsFor(notePolicy, ['edit', 'read'], null, note)).toEqual({
      edit: false,
      read: false,
    })
  })
})
