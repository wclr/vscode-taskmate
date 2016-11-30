import * as vscode from 'vscode'
import { makeTaskDriver } from '@cycler/task/xstream'
import { TaskSource } from '@cycler/task/xstream'
import { default as xs, Stream } from 'xstream'
import * as R from 'ramda'
import * as path from 'path'
import * as crypto from 'crypto'

export interface ParserRequest {
  //file: vscode.TextDocument
  file: {
    fileName: string
    data: string
  }
}

interface CommonParams {
  type: string,
  fileName: string,
  id: string,
  cwd: string,
  relDir: string,
}
interface TextParserResult {
  cmd: string, name: string
}

export interface ParsedTask extends CommonParams, TextParserResult {
  //relName: string
}

const getTaskId = (type: string, name: string, fileName: string): string =>
  crypto.createHash('md5').update(type + name + fileName).digest('hex')

export type ParserResponse = Array<ParsedTask>

export interface ParserSource extends TaskSource
  <ParserRequest, ParserResponse> { }

export interface ParserDriverOptions { }

type Parser = (text: string) => TextParserResult[]

const parsers = {
  gulp: (text: string): TextParserResult[] => {
    const pattern = /(?:gulp\.task)(?:\()(?:[^\,])((?:[^\']+)')/gi
    const cleanUpPattern = /(?:(?:(?:gulp\.task\())|(?:(?:\'))|(?:(?:\")))/gi
    const taskNames = text.match(pattern)
    return taskNames
      ? taskNames.map(name => name.replace(cleanUpPattern, ''))
        .map(name => ({ name, cmd: 'gulp ' + name }))
      : []
  },
  npm: (text: string): TextParserResult[] =>
    R.compose<
      any,
      [string, string][],
      TextParserResult[]>(
      R.map(pair => ({ name: pair[0], cmd: 'npm run ' + pair[0] })),
      R.toPairs,
    )(JSON.parse(text).scripts)
}

const getParserTypeByFileName = (fileName: string): 'gulp' | 'npm' =>
  R.cond([
    [_ => /gulpfile/.test(_), R.always('gulp')],
    [_ => /package.json/.test(_), R.always('npm')]
  ])(path.basename(fileName))

const cwd = vscode.workspace.rootPath

export const makeParserDriver = (options?: ParserDriverOptions) =>
  makeTaskDriver<ParserRequest, ParserResponse, any>(
    (request, callback) => {
      try {
        let type = getParserTypeByFileName(request.file.fileName)
        if (!type) {
          throw new Error(`No parser found for ${request.file.fileName}`)
        }
        let fileName = request.file.fileName
        let taskCwd = path.dirname(fileName)
        let relDir = path.relative(cwd, taskCwd).replace(/\\/g, '/')
        let parser: Parser = parsers[type]
        let parsed: ParserResponse
        parsed = parser(request.file.data)
          .map(_ => R.merge<CommonParams, TextParserResult>({
            id: getTaskId(type, _.name, fileName),
            type,
            relDir: relDir,
            cwd: taskCwd,
            fileName
          }, _))
        callback(null, parsed)
      } catch (error) {
        console.error(error)
        callback(error)
      }
    }
  )