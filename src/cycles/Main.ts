import * as vscode from 'vscode'
import { CommandsSource, CommandsRequest } from '../drivers/commands'
import { WindowRequest, WindowSource } from '../drivers/window'
import { ParserSource, ParserRequest } from '../drivers/parser'
import { GlobSource, GlobRequest } from '../drivers/glob'
import { WorkspaceRequest, WorkSpaceSource, } from '../drivers/workspace'
import { TerminalCommand, TerminalSource } from '../drivers/terminal'
import { StatusBarState, StatusBarSource } from '../drivers/statusbar'
import { ConfigSource, ConfigRequest, Config } from '../drivers/config'
import { Stream, default as xs } from 'xstream'
import { success, failure, pair } from '@cycle-driver/task/xstream'
import delay from 'xstream/extra/delay'
import flattenConcurrently from 'xstream/extra/flattenConcurrently'
import * as R from 'ramda'
import { TasksManager } from './TasksManager'
import { TasksLoader } from './TasksLoader'
import { TerminalManager } from './TerminalManager'

interface MainSources {
  config: ConfigSource,
  workspace: WorkSpaceSource,
  commands: CommandsSource,
  parser: ParserSource,
  window: WindowSource,
  terminal: TerminalSource,
  statusbar: StatusBarSource,
  glob: GlobSource
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
}

export const Main = (sources: MainSources): MainSinks => {
  let {config, statusbar, commands, workspace,
    parser, window, terminal, glob} = sources
  let isFolderOpened$ = xs.of(!!vscode.workspace.rootPath)
  let folderOpened$ = isFolderOpened$.filter(R.equals(true))

  let reload$ = commands
    .register('extension.taskmate.reload')
  
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
    parser, glob, workspace, window, startLoad$
  })
  let parsedTasks$ = tasksLoader.parsedTasks$
  let tasksManager = TasksManager({
    parsedTasks$,
    reload$,
    workspace, commands, window, terminal
  })

  let terminalManager = TerminalManager({ terminal, commands, statusbar })

  let loadConfig$ = startLoad$

  return {
    window: xs.merge(
      reload$.mapTo({
        method: 'showInformationMessage',
        params: ['Reloading!']
      }),
      terminalManager.message$.map(message => ({
        method: 'showInformationMessage',
        params: [message.text]
      })),
      commands
        .register('extension.taskmate.createTerminal')
        .mapTo({
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
        .debug('openTerminal')
        .map(_ => ({
          action: 'create',
          params: { name: _ || 'terminal' }
        }))
    ),
    statusbar: xs.merge(
      terminalManager.statusbar
    ),
    config: loadConfig$
  }
}

export default Main