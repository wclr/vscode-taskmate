import * as vscode from 'vscode'
import { CommandsSource, CommandsRequest } from '../drivers/commands'
import { WindowRequest, WindowSource } from '../drivers/window'
import { ParserResponse, ParsedTask } from '../drivers/parser'
import { WorkspaceRequest, WorkSpaceSource } from '../drivers/workspace'
import { TerminalCommand, terminalCommands, TerminalSource } from '../drivers/terminal'

import { Stream, MemoryStream, default as xs } from 'xstream'
import delay from 'xstream/extra/delay'
import flattenConcurrently from 'xstream/extra/flattenConcurrently'
import * as R from 'ramda'
import isolate from '@cycle/isolate'

type ParsedTasks = ParserResponse

interface TasksManagerSources {
  parsedTasks$: Stream<ParsedTasks>
  reload$: Stream<any>,
  workspace: WorkSpaceSource,
  commands: CommandsSource,
  window: WindowSource,
  terminal: TerminalSource
}

interface TasksManagerSinks {
  commands: Stream<CommandsRequest>,
  workspace: Stream<WorkspaceRequest>,
  window: Stream<WindowRequest>,
  terminal: Stream<TerminalCommand>
}
const quickPickOptions = {
  placeHolder: 'Select a Task to Launch...'
}

const getTaskRelName = (task): string => task
  .relDir.split('/')
  .filter(_ => !!_)
  .concat(task.name).join('/')

type RelName = { relName: string }

interface QuickPickItem {
  id: string,
  label: string,
  description?: string,
  detail?: string
}


const compareRelNamePartsCount = R.comparator<ParsedTask & RelName>(
  (a, b) =>
    a.relName.split('/').length < b.relName.split('/').length
)
const compareRelName = R.comparator<ParsedTask & RelName>((a, b) => a.relName < b.relName)
const getPickList = (tasks: ParsedTasks): QuickPickItem[] =>
  tasks
    .map(task => R.merge(task, { relName: getTaskRelName(task) }))
    .sort((a, b) =>
      compareRelNamePartsCount(a, b) || compareRelName(a, b)
    )
    .map((task, i) => ({
      label: task.relName.replace(/\//g, ' | '),
      id: task.id,
      description: task.type
    }))


export const TasksManager = (sources: TasksManagerSources): TasksManagerSinks => {
  const {parsedTasks$, reload$, commands, window, terminal} = sources

  let tasks$: Stream<ParsedTasks> = xs.merge(
    reload$.mapTo(null),
    parsedTasks$
  ).fold(
    (tasks: ParsedTasks, parsed) =>
      parsed ? tasks.concat(parsed) : [],
    [])

  let pickedTaskId$ = window.select('taskPick')
    .flatten()
    .filter(_ => !!_)
    .map(R.prop('id'))

  let pickedTask$ = tasks$.map(tasks =>
    pickedTaskId$.map(
      id => R.find(R.propEq('id', id), tasks)
    )
  ).flatten()
    .filter(_ => !!_)

  let showTasks$ = commands.register('extension.taskmate.showTasks')

  return {
    window: xs.merge(
      tasks$
        .map(tasks => showTasks$.mapTo(tasks))
        .flatten()
        .map(getPickList)
        .map(list => ({
          category: 'taskPick',
          method: 'showQuickPick',
          params: [list, quickPickOptions]
        }))
    ),
    terminal: xs.merge(
      pickedTask$.map(task => terminalCommands.createAndRun({
        id: task.id,
        name: getTaskRelName(task).replace(/\//g, ' | '),
        cwd: task.cwd,
        cmd: task.cmd
      }))
    ),
    commands: xs.merge(),
    workspace: xs.merge()
  }
}

export default TasksManager