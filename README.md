# DNAnexus Explorer Extension

This extension integrates with the DNAnexus platform, providing a fully-featured file explorer with drag and drop upload capabilities.

## Requirements

This extension requires the DNAnexus Command Line Interface (DX CLI) tool, which is part of the `dxpy` Python package. 

For detailed setup instructions, please refer to [DX CLI Setup](./DX_CLI_SETUP.md).

## Features

- File Explorer for DNAnexus projects
- Support for drag and drop file uploads
- Upload and download files
- Copy file IDs
- Create folders and organize files
- Monitor project storage usage
- View and manage jobs
- Browse and execute DNAnexus apps

## Development
1. Run file watcher in VS Code
```
pnpm run watch 
```

2. Open extension in new VS Code window by pressing F5 (fn+F5)

## Build

To build and package this VS Code extension, follow these steps:

1. Install vsce globally using pnpm:
  ```
  pnpm add -g vsce
  ```

2. Package the extension:
  ```
  vsce package
  ```

### Installing the VSIX in VS Code

Once you have your .vsix file, follow these steps to install it in VS Code:

1. Open VS Code.
2. Go to the Extensions view by clicking the Extensions icon or pressing Ctrl+Shift+X (Cmd+Shift+X on macOS).
3. Click on the three-dot menu in the Extensions pane and select "Install from VSIX...".
4. Locate and select your .vsix file to complete the installation.
