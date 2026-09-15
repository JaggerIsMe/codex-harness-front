import { expect, it } from 'vitest'
import { validWorkspaceName } from '@/utils/workspaceFileActions'

it('allows user dotfile names after Agent private storage migration', () => {
  for (const name of [
    '.git',
    '.CODEX',
    '.agent',
    '.agents',
    '.harness',
    '.harness-workspace.json',
    '.harness-upload-example',
    '.env',
  ]) {
    expect(validWorkspaceName(name), name).toBe(true)
  }
})

it('still rejects traversal, separators, reserved devices and invalid file names', () => {
  for (const name of [
    '',
    '.',
    '..',
    '../data',
    'a/b',
    'a\\b',
    'C:stream',
    'CON.txt',
    'NUL',
    'name.',
    'name ',
    'a\u0000b',
  ]) {
    expect(validWorkspaceName(name), name).toBe(false)
  }
})
