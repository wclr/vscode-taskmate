import * as vscode from 'vscode'
import { WindowRequest, WindowSource } from '../drivers/window'
import { FSRequest, FSSource } from '../drivers/fs'
import { ParserSource, ParserRequest } from '../drivers/parser'
import { GlobSource, GlobRequest } from '../drivers/glob'
import { WorkspaceRequest, WorkSpaceSource, WorkspaceEvents } from '../drivers/workspace'
import { Stream, default as xs } from 'xstream'
import { success, failure, pair } from '@cycler/task/xstream'

import delay from 'xstream/extra/delay'
import flattenConcurrently from 'xstream/extra/flattenConcurrently'
import * as R from 'ramda'

const globIgnorePatterns = ['**/node_modules/**', '**/jspm_packages/**', '**/bower_components/**']
const globPatterns = ['**/gulpfile.js', '**/package.json']

interface TasksLoaderSources {
  startLoad$: Stream<any>,
  workspace: WorkSpaceSource,
  parser: ParserSource,
  window: WindowSource,
  glob: GlobSource,
  fs: FSSource
}

interface TasksLoaderSinks {
  parsedTasks$: Stream<any>,
  workspace: Stream<WorkspaceRequest>,
  window: Stream<WindowRequest>,
  parser: Stream<ParserRequest>
  glob: Stream<GlobRequest>
  fs: Stream<FSRequest>
}

function oneByOneWithDelay<T>(files$: Stream<Array<T>>): Stream<T> {
  return files$
    .map(files => files.map(R.pair))
    .map(xs.fromArray)
    .compose(flattenConcurrently)
    .map(pair => xs.of(pair[0]).compose(delay(pair[1] * 100)))
    .compose(flattenConcurrently)
}

export const TasksLoader = (sources: TasksLoaderSources): TasksLoaderSinks => {
  let {fs, glob, parser, workspace, startLoad$} = sources

  let filesFound$ = glob
    .select()
    .map(success)
    .compose(flattenConcurrently)

  let filesFoundError$ = workspace.select()
    .map(failure)
    .compose(flattenConcurrently).debug('failure')

  let parserError$ = parser.select()
    .map(failure)
    .map(pair)
    .flatten()
    .map((pair) => `Error while parsing ${pair[0].file.fileName}`)

  let errorMessage$: Stream<string> =
    xs.merge(
      parserError$,
      filesFoundError$
    ).map(errorMessage => 'Task Mate: ' + errorMessage)

  let parsedTasks$ = parser.select()
    .map(success)
    .compose(flattenConcurrently)

  return {
    parsedTasks$,
    workspace: xs.empty(),
    fs: filesFound$
      .compose(oneByOneWithDelay)
      .map((file: vscode.Uri) => ({
        category: 'openFile',
        method: 'readFile',
        path: file.fsPath,
        params: [file.fsPath, 'utf-8']
      })),
    // workspace: filesFound$
    //   .compose(oneByOneWithDelay)
    //   .map((file: vscode.Uri) => ({
    //     category: 'openFile',
    //     method: 'openTextDocument',
    //     params: [file.fsPath]
    //   })),
    parser: fs.select<string, { path: string }>('openFile')
      .map(success)
      .map(pair)
      .compose(flattenConcurrently)
      .map(([request, data]) =>
        ({ file: { fileName: request.path, data: data } })
      ),
      // .map((file: vscode.TextDocument) => ({
      //   file
      // })),
    glob: startLoad$.mapTo(xs.fromArray(globPatterns))
      .compose(flattenConcurrently)
      .map(pattern => ({
        pattern, options: {
          cwd: vscode.workspace.rootPath,
          ignore: globIgnorePatterns
        }
      })),
    window: xs.empty()
  }
}