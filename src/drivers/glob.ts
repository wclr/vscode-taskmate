import * as vscode from 'vscode'
import * as path from 'path'
import * as glob from 'glob'
import { makeTaskDriver, TaskSource } from '@cycle-driver/task/xstream'

export interface GlobRequest {
  pattern: string,
  options?: glob.IOptions
}


export type GlobResponse = Array<vscode.Uri>
export type GlobSource = TaskSource<GlobRequest, GlobResponse>

export const makeGlobDriver = () => {
  return makeTaskDriver<GlobRequest, GlobResponse, any>(
    (request, callback) => {
      let options = request.options || {}
      glob(request.pattern, options, (err, matches) => {

        if (err) {
          callback(err)
        } else {
          const cwd = options.cwd || process.cwd()
          let uris = matches.map(match => path.join(cwd, match))
            .map(filePath => vscode.Uri.file(filePath))
          callback(null, uris)
        }
      })
    })
}