/// <reference path="../../node_modules/@cycle-driver/task/index.d.ts" />
import * as vscode from 'vscode'
import { TaskSource, makeTaskDriver } from '@cycle-driver/task/xstream'
//import { Something } from '@cycle-driver/task'
import { default as xs, Stream } from 'xstream'

export const WorkspaceEvents = {
  onDidChangeConfiguration: 'onDidChangeConfiguration',
  onDidChangeTextDocument: 'onDidChangeTextDocument',
  onDidCloseTextDocument: 'onDidCloseTextDocument',
  onDidOpenTextDocument: 'onDidOpenTextDocument',
  onDidSaveTextDocument: 'onDidSaveTextDocument'
}

export interface WorkspaceRequest {
  category?: string,
  method: string,
  params: any[]
}

export type WorkspaceResponse = any

export interface WorkSpaceSource extends TaskSource
  <WorkspaceRequest, WorkspaceResponse> {
  events: (eventName: string) => Stream<any>
}

export interface WorkspaceDriverOptions {
  context: vscode.ExtensionContext
}

export const makeWorkspaceDriver = ({context}: WorkspaceDriverOptions) => {
  return (sink$: any, runSA: any): WorkSpaceSource => {
    const source = <WorkSpaceSource>makeTaskDriver
      <WorkspaceRequest, WorkspaceResponse, any>({
        getResponse: (request) => {
          if (typeof vscode.workspace[request.method] !== 'function') {
            throw new Error(`Illegal workspace method ${request.method}`)
          }
          return vscode.workspace[request.method](...request.params)
        }
      })(sink$, runSA)

    const registerEvent = (eventName) => {
      return xs.create({
        start: (listener) => {
          let disposable = vscode.workspace[eventName]((e) => {
            listener.next(e)
          })
          context.subscriptions.push(disposable)
        },
        stop: () => { }
      })
    }

    Object.defineProperty(source, 'events', <PropertyDescriptor>{
      value: registerEvent,
      writable: false,
    })
    return source
  }
}
