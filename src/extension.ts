import * as vscode from 'vscode'
import { run } from '@cycle/xstream-run'
import { makeConfigDriver } from './drivers/config'
import { makeCommandsDriver } from './drivers/commands'
import { makeGlobDriver } from './drivers/glob'
import { makeWindowDriver } from './drivers/window'
import { makeWorkspaceDriver } from './drivers/workspace'
import { makeParserDriver } from './drivers/parser'
import { makeStatusBarDriver } from './drivers/statusbar'
import { makeTerminalDriver } from './drivers/terminal'
import { makeFSDriver } from './drivers/fs'
import Main from './cycles/Main'

let dispose: () => any

export function activate(context: vscode.ExtensionContext) {
  dispose = run(Main, {
    config: makeConfigDriver(),
    workspace: makeWorkspaceDriver({ context }),
    commands: makeCommandsDriver({ context }),
    window: makeWindowDriver({ context }),
    statusbar: makeStatusBarDriver(),
    parser: makeParserDriver(),
    fs: makeFSDriver(),
    terminal: makeTerminalDriver(),
    glob: makeGlobDriver()
  })
}

export function deactivate() {
  dispose()
}