import * as vscode from 'vscode'
import { CommandsSource, CommandsRequest } from '../drivers/commands'
import { WindowRequest, WindowSource } from '../drivers/window'
import { FSRequest, FSSource } from '../drivers/fs'
import { ParserSource, ParserRequest } from '../drivers/parser'
import { GlobSource, GlobRequest } from '../drivers/glob'
import { WorkspaceRequest, WorkSpaceSource, } from '../drivers/workspace'
import { TerminalCommand, TerminalSource } from '../drivers/terminal'
import { StatusBarState, StatusBarSource } from '../drivers/statusbar'
import { ConfigSource, ConfigRequest, Config } from '../drivers/config'
import { Stream, default as xs } from 'xstream'
import { success, failure, pair } from '@cycler/task/xstream'
import delay from 'xstream/extra/delay'
import flattenConcurrently from 'xstream/extra/flattenConcurrently'
import * as R from 'ramda'
import { TasksManager } from './TasksManager'
import { TasksLoader } from './TasksLoader'
import { TerminalManager } from './TerminalManager'
import * as fs from 'fs'
import * as path from 'path'


const getPathFolderPath = (fsPath: string): string =>
  fs.statSync(fsPath).isDirectory()
    ? fsPath
    : path.dirname(fsPath)


interface MainSources {
  config: ConfigSource,
  workspace: WorkSpaceSource,
  commands: CommandsSource,
  parser: ParserSource,
  window: WindowSource,
  terminal: TerminalSource,
  statusbar: StatusBarSource,
  glob: GlobSource
  fs: FSSource
}

interface MainSinks {
  config: Stream<ConfigRequest>
  commands?: Stream<CommandsRequest>,
  workspace?: Stream<WorkspaceRequest>,
  window?: Stream<WindowRequest>,
  parser?: Stream<ParserRequest>
  statusbar?: Stream<StatusBarState>,
  terminal: Stream<TerminalCommand>,
  glob: Stream<GlobRequest>
  fs: Stream<FSRequest>
}

export const Main = (sources: MainSources): MainSinks => {
  let {fs, config, statusbar, commands, workspace,
    parser, window, terminal, glob} = sources
  let isFolderOpened$ = xs.of(!!vscode.workspace.rootPath)
  let folderOpened$ = isFolderOpened$.filter(R.equals(true))

  let reloadFromTaskList$ = xs.create()
  let reload$ = xs.merge(commands
    .register('taskmate.reload'),
    reloadFromTaskList$
  )

  let config$ = config
    .select().map(success)
    .flatten().debug('config$').addListener({
      next: () => { },
      error: () => { },
      complete: () => { },
    })

  // let noConfigLoaded$ = workspace
  //   .select('loadConfig').map(failure)

  let startLoad$ = xs.merge(reload$, folderOpened$)
    .compose(delay(0))

  let tasksLoader = TasksLoader({
    fs, parser, glob, workspace, window, startLoad$
  })
  let parsedTasks$ = tasksLoader.parsedTasks$
  let tasksManager = TasksManager({
    parsedTasks$,
    reload$,
    workspace, commands, window, terminal
  })

  reloadFromTaskList$.imitate(
    tasksManager.pickedTaskId$.filter(R.equals('reloadTasks'))
  )

  let terminalManager = TerminalManager({ terminal, commands, statusbar })

  let loadConfig$ = startLoad$

  return {
    window: xs.merge(
      // reload$.mapTo({
      //   method: 'showInformationMessage',
      //   params: ['Reloading!']
      // }),
      terminalManager.message$.map(message => ({
        method: 'showInformationMessage',
        params: [message.text]
      })),
      xs.merge(
        tasksManager.pickedTaskId$.filter(R.equals('openTerminal')),
        commands
          .register('taskmate.createTerminal')
      ).mapTo({
        method: 'showInputBox',
        category: 'openTerminal',
        params: [{
          prompt: 'Please enter terminal name',
          value: 'terminal'
        }]
      }),
      // errorMessage$.map((message) => ({
      //   method: 'showErrorMessage',
      //   params: [message]
      // })),
      tasksManager.window
    ),
    glob: tasksLoader.glob,
    workspace: xs.merge(
      tasksLoader.workspace,
      tasksManager.workspace
    ),
    commands: xs.merge(
      tasksManager.commands
    ),
    parser: tasksLoader.parser,
    terminal: xs.merge(
      tasksManager.terminal,
      terminalManager.terminal,
      window.select('openTerminal')
        .flatten()
        .map(_ => ({
          action: 'create',
          params: { name: _ || 'terminal' }
        })),
      commands
        .register('taskmate.createTerminalHere')
        .debug('taskmate.createTerminalHere')
        .map(R.defaultTo({ fsPath: vscode.workspace.rootPath }))
        .map((uri: vscode.Uri) => uri.fsPath)
        .debug('here fsPath')
        .map(getPathFolderPath)
        .map((folderPath) => ({
          action: 'create',
          params: {
            name: path.basename(folderPath),
            cwd: folderPath
          }
        })),
    ),
    statusbar: xs.merge(
      terminalManager.statusbar
    ),
    config: loadConfig$,
    fs: tasksLoader.fs
  }
}

export default Main