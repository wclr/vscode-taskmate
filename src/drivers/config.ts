import * as vscode from 'vscode'
import * as path from 'path'
import { makeTaskDriver, TaskSource } from '@cycler/task/xstream'
import * as R from 'ramda'

export interface ConfigRequest { }

interface CustomCommand {
  title: string,
  name?: string,
  tasks: { name: string, type: string }[]
}

export interface Config {
  trackProcesses: boolean,
  showProcesses: boolean,
  //loadNestedFromNestedFolders?: boolean,
  commands: CustomCommand[],
  globIgnorePatterns: string[],
  globPatterns: string[]
}

export type ConfigSource = TaskSource<ConfigRequest, Config>

const defaultConfig: Config = {
  trackProcesses: true,
  showProcesses: false,
  commands: [],
  globIgnorePatterns: [
    '**/node_modules/**',
    '**/jspm_packages/**',
    '**/bower_components/**'
  ],
  globPatterns: ['**/gulpfile.js', '**/package.json']
}

export const makeConfigDriver = () => {
  return makeTaskDriver<ConfigRequest, Config, any>(
    (request, callback) => {
      
      let sendConfig = (config) => {
        callback(null, R.merge(defaultConfig, config))
      }

      if (request === 'default') {
        return sendConfig({})
      }
      
      vscode.workspace
        .openTextDocument(vscode.workspace.rootPath + '/.vscode/taskmate.json')
        .then((file) => {
          try {
            let loadedConfig = JSON.parse(file.getText())
            sendConfig(loadedConfig)
          } catch (e) {
            callback('Error while parsing taskmate.json')
          }
        }, (err) => {
          sendConfig({})
        })
    })
}