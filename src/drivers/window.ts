import * as vscode from 'vscode'
import { default as xs, Stream } from 'xstream'
import { makeTaskDriver, TaskSource } from '@cycler/task/xstream'

export interface WindowRequest {
  method: string,
  params?: any[]
}

export type WindowResponse = any

export interface WindowSource extends TaskSource
  <WindowRequest, WindowResponse> {
  events: (eventName: string) => Stream<any>
}


// export const WindowEvents = {
//   onDidChangeActiveTextEditor: 'onDidChangeActiveTextEditor',
//   onDidChangeTextEditorOptions: 'onDidChangeTextEditorOptions',
//   onDidChangeTextEditorSelection: 'onDidChangeTextEditorSelection',
//   onDidChangeTextEditorViewColumn: 'onDidChangeTextEditorViewColumn'
// }

export interface WindowDriverOptions {
  context: vscode.ExtensionContext
}
// 
export const makeWindowDriver = ({context}: WindowDriverOptions) => {
  return (sink$: any, runSA: any): WindowSource => {
    const source = <WindowSource>makeTaskDriver
      <WindowRequest, WindowResponse, any>({
        getResponse: (request) => {
          if (typeof vscode.window[request.method] !== 'function') {
            // throw new Error(`Illegal window method ${request.method}`)
          }
          return vscode.window[request.method](...request.params || [])
        }
      })(sink$, runSA)

    const registerEvent = (eventName) => {
      return xs.create({
        start: (listener) => {
          let disposable = vscode.window[eventName]((e) => {
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

