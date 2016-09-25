import * as vscode from 'vscode'
import { default as xs, Stream } from 'xstream'

export interface StatusBarItem {
  id?: string,
  text: string,
  color?: string
  tooltip?: string
  command?: string
}

export interface StatusBarState {
  message?: string,
  messageTimeout?: number,
  items: StatusBarItem[]
}

export interface StatusBarSource {
  // clicks: Stream<{ index: number, id: string | undefined }>,
}


type StatusBarItemInstance = StatusBarItem & { _item: vscode.StatusBarItem }

interface StatusBarInnerState {
  message: string,
  items: StatusBarItemInstance[]
}
export const makeStatusBarDriver = () => {
  let statusBarItems = {}
  let state: StatusBarInnerState = {
    message: '',
    items: []
  }
  let updateTimeout: NodeJS.Timer
  return (sink$: Stream<StatusBarState>, runSA) => {
    sink$.addListener({
      next: (update) => {        
        clearTimeout(updateTimeout)
        updateTimeout = setTimeout(() => {
          state.items.forEach(item => item._item.dispose())
          let message = update.message || ''
          if (update.messageTimeout) {
            vscode.window.setStatusBarMessage(message, update.messageTimeout)
          } else {
            vscode.window.setStatusBarMessage(message)
          }
          state.items = update.items.map((updateItem, index) => {
            let {id, text, color, tooltip, command} = updateItem            
            let _item = vscode.window.createStatusBarItem()
            _item.text = text
            if (color) {
              _item.color = color
            }
            if (tooltip) {
              _item.tooltip = tooltip
            }
            if (command) {
              _item.command = command
            }
            _item.show()
            return {
              id, text, color, tooltip, command,
              _item
            }
          })
        }, 250)
      },
      error: () => { },
      complete: () => { }
    })
  }
}


// export interface StatusBarCommand {
//   action: string,
//   itemId?: string,
//   params?: any[]
// }
// //item = new vscode.StatusBarItem()

// // let item = vscode.window.createStatusBarItem()
// // item. 
// export const makeStatusBarDriver = () => {
//   let statusBarItems = {}
//   return (sink$: Stream<StatusBarCommand>, runSA) => {
//     sink$.addListener({
//       next: (command) => {
//         if (command.itemId && command.action === 'create') {
//           let item = statusBarItems[command.itemId]
//             = vscode.window.createStatusBarItem()
//           vscode.window.setStatusBarMessage('ok ok')
//           let params = command.params || []
//           item.text = params[0] || ''
//           item.tooltip = 'hera i am'
//           item.command = 'extension.taskmate.statusBarClick'
//           item.color = 'gray'          
//           item.show()

//         }
//         //items[action.itemId] = vscode.window.createStatusBarItem()
//       },
//       error: () => { },
//       complete: () => { }
//     })
//   }
// }
