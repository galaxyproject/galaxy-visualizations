
import { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application';

const plugin: JupyterFrontEndPlugin<void> = {
  id: 'jl-galaxy:plugin',
  autoStart: true,
  activate: (app: JupyterFrontEnd) => {
    console.log("Activated jl-galaxy!", app);

    app.commands.commandExecuted.connect((_, args) => {
      if (args.id === 'docmanager:save') {
        console.log('🧭 Detected save command');

        const widget = app.shell.currentWidget;
        const model = (widget as any)?.content?.model;
        if (model?.toJSON) {
          const content = model.toJSON();
          console.log('📝 Notebook content:', content);
        }
      }
    });
  }
};

export default [plugin];
