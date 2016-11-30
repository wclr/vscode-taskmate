import * as vscode from 'vscode'
import { makeTaskDriver, TaskSource } from '@cycler/task/xstream'
import { default as xs, Stream } from 'xstream'

export interface CommandsRequest {
  command: string,
  params: any[]
}

// export interface CommandsResponse {
//   command: string,
//   params: any[],
//   result: any
// }
export type CommandsResponse = any

export interface CommandsSource extends TaskSource
  <CommandsRequest, CommandsResponse> {
  register: (command: string) => Stream<any>
}

// class MainCommandsSource implements CommandsSource {
//   private readonly _registredCommands = {}
//   constructor(private _asyncSource, private _context) {
//   }
//   filter(predicate) {
//     return new MainCommandsSource(
//       this._asyncSource.filter(predicate), this._context
//     )
//   }
//   select(category: string) {
//     return this._asyncSource.select(category)
//   }
//   isolateSource(source: MainCommandsSource, scope: string) {
//     return new MainCommandsSource(
//       this._asyncSource.isolateSink(this._asyncSource, scope), this._context
//     )
//   }
//   isolateSink(request$, scope: string) {
//     return this._asyncSource.isolateSink(request$, scope)
//   }
//   register (command) {
//     if (this._registredCommands[command]){
//       return this._registredCommands[command]
//     }
//     this._registredCommands[command] = xs.create({
//         start: (listener) => {
//           let disposable = vscode.commands.registerCommand(command, () => {
//             listener.next(true)
//           })
//           this._context.subscriptions.push(disposable)
//         },
//         stop: () => { }
//       })
//       return this._registredCommands[command]
//   }
// }

export interface CommandsDriverOptions {
  context: vscode.ExtensionContext
}

export const makeCommandsDriver = ({context}: CommandsDriverOptions) => {
  return (sink$: any, runSA: any) => {
    const source = <CommandsSource>makeTaskDriver
      <CommandsRequest, CommandsResponse, any>({
        getResponse: (request) => {
          return vscode.commands.executeCommand(request.command, ...request.params)
        }
      })(sink$, runSA)
    
    const registredCommands = {}

    const registerCommand = (command: string) => {
      if (!registredCommands[command]) {
        let events$ = xs.create({
          start: (listener) => {
            this.disposable = vscode.commands.registerCommand(command, (result) => {              
              listener.next(result)
            })            
            context.subscriptions.push(this.disposable)
          },
          stop: () => { 
            this.disposable.dispose()
          }
        })
        events$.addListener({
          next: () => {},
          error: () => {},
          complete: () => {},
        })
        registredCommands[command] = events$
      }

      return registredCommands[command]
    }

    Object.defineProperty(source, 'register', <PropertyDescriptor>{
      value: registerCommand,
      writable: false,
    })

    return source
  }
}