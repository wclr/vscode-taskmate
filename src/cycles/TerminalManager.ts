import * as vscode from 'vscode'
import { CommandsSource, CommandsRequest } from '../drivers/commands'
import { WindowRequest, WindowSource } from '../drivers/window'
import { ParserSource, ParserRequest } from '../drivers/parser'
import { GlobSource, GlobRequest } from '../drivers/glob'
import { WorkspaceRequest, WorkSpaceSource, WorkspaceEvents } from '../drivers/workspace'
import { TerminalCommand, TerminalSource, TerminalState } from '../drivers/terminal'
import { StatusBarState, StatusBarSource } from '../drivers/statusbar'
import { Stream, default as xs } from 'xstream'
import { success, failure, pair } from '@cycler/task/xstream'
import delay from 'xstream/extra/delay'
import flattenConcurrently from 'xstream/extra/flattenConcurrently'
import * as R from 'ramda'

interface TerminalManagerSources {
  statusbar: StatusBarSource,
  commands: CommandsSource
  terminal: TerminalSource
}

type WindowMessage = { type: string, text: string }

interface TerminalManagerSinks {
  message$: Stream<WindowMessage>,
  terminal: Stream<TerminalCommand>,
  statusbar: Stream<StatusBarState>,
}


interface Terminal {
  id: string,
  name: string,
  state: TerminalState,
  processesCount: number
}

const barItemCommandPrefix = 'taskmate.statusBarClick_'

const barItemStateColors = {
  running: '#98e698',
  changed: '#ffd394'
}

const barItemDefaultColor = '#DDD'

const barItemStateIcons = {
  running: 'rocket',
  changed: 'issue-opened'
}

export const TerminalManager = (sources: TerminalManagerSources): TerminalManagerSinks => {

  let {terminal, commands, statusbar} = sources

  let terminalCreated$ = terminal
    .events('created')

  let disposed$ = terminal
    .events('created')
  let terminals$: Stream<Terminal[]> = terminal.events()
    .debug('terminal event')
    .fold((terminals: Terminal[], event) => {

      if (event.type === 'created') {
        return terminals.concat({
          name: event.name,
          id: event.id,
          state: event.state,
          processesCount: event.processesCount
        })
      }
      if (event.type === 'disposed') {
        return R.without(
          [R.find((terminal: any) => event.id == terminal.id, terminals)],
          terminals
        )
      }
      if (event.type === 'state') {
        let overLens = R.compose(
          R.over,
          R.lensIndex,
          R.findIndex(R.propEq('id', event.id)),
        )(terminals)
        terminals = overLens(R.assoc('processesCount', event.processesCount), terminals)
        return overLens(R.assoc('state', event.state), terminals)
      }
      return terminals
    }
    , []).debug('terminals$')

  let clickedId$ = terminals$.map(terminals => {
    return terminals.map(terminal =>
      commands.register(barItemCommandPrefix + terminal.id)
    )
  }).map(xs.fromArray)
    .compose(flattenConcurrently)
    .compose(flattenConcurrently)
    .map(R.split('_'))
    .map(R.last)

  let changedId$ = terminal
    .events('state')
    .filter(R.propEq('state', 'changed'))
    //.map(R.prop('id'))
    .map(_ => _.id)

  let stoppedId$ = terminal
    .events('state')
    .filter(R.propEq('state', 'stopped'))
    //.map(R.prop<string>('id'))
    .map(_ => _.id)


  return {
    message$: xs.merge(
      // terminal.events('state')
      //   .filter(R.propEq('state', 'changed'))
      //   .map(
      //   clicked => ({ type: 'warn', text: `Check something wrong with task` })
      //   )
    ),
    terminal: xs.merge(
      xs.merge(
        clickedId$,
        //changedId$,
        //stoppedId$
      ).map(id => ({
        id,
        action: 'show',
      }))
    ),
    statusbar: terminals$.map((terminals) => {
      let terminalItems = terminals.map((t) => ({
        text: `$(${barItemStateIcons[t.state] || 'terminal'}) ${t.name} (${t.processesCount})`,
        color: barItemStateColors[t.state] || barItemDefaultColor,
        tooltip: '',
        command: barItemCommandPrefix + t.id
      }))
      return {
        items: [
          {
            text: '$(clippy) Taskmate',
            tooltip: 'List tasks to run',
            command: 'taskmate.showTasks'
          }
        ].concat(terminalItems)
      }
    })
  }
}