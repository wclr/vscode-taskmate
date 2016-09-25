import * as vscode from 'vscode'
import { default as xs, Stream, MemoryStream } from 'xstream'
import { makeTaskDriver, TaskSource } from '@cycle-driver/task/xstream'
//import psTree = require('ps-tree')
//import psTree from 'ps-tree'
import * as fs from 'fs'
import psTree, * as ps from 'ps-tree'


export interface TerminalCommand {
  category?: string
  id?: string,
  action: string,
  params?: any
}

interface CreateCommandParams {
  id: string,
  name: string,
  cwd: string,
  cmd: string
}

export const terminalCommands = {
  create: (id, name): TerminalCommand => {
    return {
      id,
      action: 'create',
      params: { name }
    }
  },
  createAndRun: (params: CreateCommandParams): TerminalCommand => {
    return {
      id: params.id,
      action: 'createAndRun',
      params: params
    }
  }
}

export interface TerminalSource {
  events: (type?: string) => Stream<TerminalEvent>
}

export type TerminalState = 'stopped' | 'running' | 'changed'

export interface TerminalEvent {
  type: string,
  id: string,
  name: string,
  state: TerminalState,
  processesCount: number
}

function checkTerminalReady(terminal: any, tries: number) {
  return new Promise((resolve, reject) => {
    if (tries === 0) {
      reject()
    } else if (terminal._id) {
      resolve()
    } else {
      setTimeout(() => {
        checkTerminalReady(terminal, tries--)
          .then(resolve, reject)
      }, 250)
    }
  })
}

interface Terminal {
  _id: number,
  processId: Thenable<number>
  sendText: (text: string, pressEnter: boolean) => void
  show: () => void
  dispose: () => void
}

interface TerminalInstance {
  id: string,
  pid: number,
  name: string,
  initialProcesses: any[]
  processes: any[]
  state: TerminalState
  terminal: Terminal
}

const allowedSyncActions = ['show', 'dispose']


const getRunningProcesses = (pids: number[]) => {
  return new Promise<ps.ProcessInfo[][]>((resolve, reject) => {
    psTree(pids, (err, results) => {
      err ? reject(err) : resolve(results)
    })
  })
}

export function makeTerminalDriver() {

  const terminalInstancesMap: { [index: string]: TerminalInstance } = {}
  const window = (<any>vscode.window)

  return (sink$: Stream<TerminalCommand>, runSA) => {

    function emitEvent(type: string, id: string) {
      let {name, state, processes} = terminalInstancesMap[id]
      events$.shamefullySendNext({
        type, id, name, state, processesCount: processes.length
      })
    }
    let checkTimer: NodeJS.Timer
    let setCheckTimer = () => {
      clearTimeout(checkTimer)
      checkTimer = setTimeout(() => {
        checkTerminalsState()
      }, 4000)
    }

    function checkTerminalsState() {
      let ids = Object.keys(terminalInstancesMap)
      if (!ids.length) {
        return setCheckTimer()
      }
      let pids = ids.map(id => terminalInstancesMap[id].pid)
      getRunningProcesses(pids).then((results) => {
        results.forEach((processes, index) => {
          let id = ids[index]
          let instance = terminalInstancesMap[id]
          let initialProcessCount = instance.initialProcesses.length
          let runningProcessesCount = processes.length
          if (initialProcessCount > 0 && runningProcessesCount === 0) {
            emitEvent('disposed', id)
            delete terminalInstancesMap[id]
            return
          }
          let state: TerminalState = instance.state
          let previouslyRunningProcessesCount = instance.processes.length
          let runningSomething = runningProcessesCount > initialProcessCount
          if (runningSomething) {
            let lessThenBefore = runningProcessesCount < previouslyRunningProcessesCount
            let moreThenBefore = runningProcessesCount > previouslyRunningProcessesCount
            let isStopped = instance.state === 'stopped'
            if (lessThenBefore) {
              state = 'changed'
            } else if (moreThenBefore) {
              state = 'running'
            }
          } else {
            state = 'stopped'
          }
          instance.processes = processes

          if (instance.state !== state) {
            instance.state = state
            emitEvent('state', id)
          }
        })
        setCheckTimer()
      })
    }
    let events$ = xs.create<TerminalEvent>({
      start: (listener) => {
        setCheckTimer()
      },
      stop: () => {
        clearTimeout(checkTimer)
      }
    })
    events$.addListener({
      next: () => { },
      error: () => { },
      complete: () => { },
    })
    const getUniqId = () => (Math.random() * 1000).toFixed(0)
    const waitAMomentToSettleDown = (cb) => setTimeout(cb, 500)

    sink$.addListener({
      next: (command) => {
        if (command.action === 'create' || command.action === 'createAndRun') {
          let id = command.id || getUniqId()
          let instance: any = terminalInstancesMap[id]
          if (instance) {
            instance.terminal.show()
            return
          }

          let params: CreateCommandParams = command.params
          let terminal: Terminal = window.createTerminal(params.name)
          if (window.onDidCloseTerminal) {
            let dispose = window.onDidCloseTerminal((t) => {
              if (t == terminal) {
                emitEvent('disposed', id)
                dispose()
              }
            })
          }                    
          checkTerminalReady(terminal, 10).then(() => {
            waitAMomentToSettleDown(() => {
              let pidPromise = terminal.processId || Promise.resolve(terminal._id)              
              pidPromise.then((pid) => {
                //setTimeout(() => {
                ps.getAllProcesses((err, allProcesses) => {
                  let children = ps.getChildren(pid, allProcesses)
                  let parent = ps.getParent(pid, allProcesses)
                  let childrenOfParent = parent && ps.getChildren(parent.PID, allProcesses)
                  console.log('pid', pid)
                  //console.log('getAllProcesses childrenOfParent', childrenOfParent)
                  terminalInstancesMap[id] = {
                    id,
                    pid: pid,
                    name: params.name,
                    terminal,
                    initialProcesses: children,
                    processes: children,
                    state: 'stopped'
                  }
                  if (command.action === 'createAndRun') {
                    terminal.sendText(`cd ${params.cwd}`, true)
                    terminal.sendText(params.cmd, true)
                  }
                  //console.log('initialProcesses', initialProcesses)
                  terminal.show()
                  emitEvent('created', id)
                })
                // psTree(pid, (err, initialProcesses) => {
                //   terminalInstancesMap[id] = {
                //     id,
                //     pid: pid,
                //     name: params.name,
                //     terminal,
                //     initialProcesses,
                //     processes: initialProcesses,
                //     state: 'stopped'
                //   }
                //   console.log('initialProcesses', initialProcesses)
                //   terminal.show()
                //   emitEvent('created', id)
                // })
                //}, 10000)

              })
            })

          })
        }
        if (allowedSyncActions.indexOf(command.action) >= 0 && command.id) {
          let instance: any = terminalInstancesMap[command.id]
          instance.terminal[command.action]()
        }
      },
      error: () => { },
      complete: () => { }
    })

    return {
      events: (type?: string) => {
        return type
          ? events$.filter(event => event.type === type)
          : events$
      }
    }
  }
}
