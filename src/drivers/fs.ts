import * as fs from 'fs'
import { default as xs, Stream } from 'xstream'
import { makeTaskDriver, TaskSource } from '@cycler/task/xstream'

export interface FSRequest {
  method: string,
  params?: any[]
}

export type FSResponse = {}

export interface FSSource extends TaskSource
  <FSRequest, FSResponse> {  
}


// export const WindowEvents = {
//   onDidChangeActiveTextEditor: 'onDidChangeActiveTextEditor',
//   onDidChangeTextEditorOptions: 'onDidChangeTextEditorOptions',
//   onDidChangeTextEditorSelection: 'onDidChangeTextEditorSelection',
//   onDidChangeTextEditorViewColumn: 'onDidChangeTextEditorViewColumn'
// }

// 
export const makeFSDriver = () => {
  return (sink$: any, runSA: any): FSSource => {
    const source = <FSSource>makeTaskDriver
      <FSRequest, FSResponse, any>({
        getResponse: (request, cb) => {
          if (typeof fs[request.method] !== 'function') {
             throw new Error(`Illegal fs method ${request.method}`)
          }
          fs[request.method](...request.params || [], cb)
        }
      })(sink$, runSA)
    return source
  }
}

