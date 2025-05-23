import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';

export enum DxAppNodeType {
  App = 'app',
  Template = 'template'
}

export interface AppRunTemplate {
  jobName: string;
  instanceType: string;
  output_folder: string,
  project: string,
  inputs: Record<string, any>
}

export class DxAppNode {
  constructor(
    readonly id: string,
    readonly label: string,
    readonly dxid: string,
    readonly jsonData: any,
    readonly type: DxAppNodeType = DxAppNodeType.App,
    readonly parent?: DxAppNode,
    readonly templateData?: AppRunTemplate
  ) {}

  // Get the app directory path for storing templates
  public static getAppDirectoryPath(rootPath: string, dxid: string): string {
    const appDir = path.join(rootPath, 'tmp', 'apps', dxid);
    if (!fs.existsSync(appDir)) {
      fs.mkdirSync(appDir, { recursive: true });
    }
    return appDir;
  }

  // Load templates for an app
  public static loadTemplates(rootPath: string, parentNode: DxAppNode): DxAppNode[] {
    try {
      const appDir = DxAppNode.getAppDirectoryPath(rootPath, parentNode.dxid);
      const templateFiles = fs.readdirSync(appDir).filter(file => file.endsWith('.json'));
      
      return templateFiles.map(file => {
        const filePath = path.join(appDir, file);
        const templateData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const templateName = path.basename(file, '.json');
        
        return new DxAppNode(
          templateName,
          templateName,
          parentNode.dxid,
          parentNode.jsonData,
          DxAppNodeType.Template,
          parentNode,
          templateData
        );
      });
    } catch (error) {
      console.error('Error loading templates:', error);
      return [];
    }
  }

  // Save a template
  public static saveTemplate(rootPath: string, appId: string, templateName: string, templateData: AppRunTemplate): void {
    const appDir = DxAppNode.getAppDirectoryPath(rootPath, appId);
    const filePath = path.join(appDir, `${templateName}.json`);
    fs.writeFileSync(filePath, JSON.stringify(templateData, null, 2));
  }

  // Delete a template
  public static deleteTemplate(rootPath: string, appId: string, templateName: string): void {
    const appDir = DxAppNode.getAppDirectoryPath(rootPath, appId);
    const filePath = path.join(appDir, `${templateName}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}
