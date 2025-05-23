import * as vscode from 'vscode';

export const dxStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);

export function initializeStatusBar(context: vscode.ExtensionContext) {
    dxStatusBarItem.text = '$(cloud) DNAnexus';
    dxStatusBarItem.tooltip = 'DNAnexus Platform';
    dxStatusBarItem.command = 'dx-vscode.checkEnvironment';
    dxStatusBarItem.show();
    context.subscriptions.push(dxStatusBarItem);
}
