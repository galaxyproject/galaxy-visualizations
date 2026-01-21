import { ConfigurationSchema } from '@jbrowse/core/configuration'
import WidgetType from '@jbrowse/core/pluggableElementTypes/WidgetType'
import Plugin from '@jbrowse/core/Plugin'
import { ElementId } from '@jbrowse/core/util/types/mst'
import React, { useEffect } from 'react'
import { types } from 'mobx-state-tree'
import { observer } from 'mobx-react'

console.log('🧪 FieldSelectionPlugin module loaded')

// React component for the widget
const ReactComponent = observer(({ model }) => {
  useEffect(() => {
    console.log('👀 FieldSelectionWidget mounted')
    return () => {
      console.log('💨 FieldSelectionWidget unmounted')
    }
  }, [])

  console.log('✅ FieldSelectionWidget rendered:', model)

  return (
    <div style={{ padding: 16 }}>
      <h3>Add Track with Field Selection</h3>
      <p>Widget ID: {model.id}</p>
    </div>
  )
})

// Config schema (empty for now)
const configSchema = ConfigurationSchema('FieldSelectionWidget', {})

// State model for the widget
const stateModel = types
  .model('FieldSelectionWidget', {
    id: ElementId,
    type: types.literal('FieldSelectionWidget'),
  })
  .views(self => ({
    get heading() {
      return 'Field Selection'
    },
  }))

// Main plugin class
export default class FieldSelectionPlugin extends Plugin {
  name = 'FieldSelectionPlugin'

  install(pluginManager) {
    console.log('✅ Installing FieldSelectionPlugin')

    pluginManager.addWidgetType(() => {
      console.log('✅ Registering FieldSelectionWidget')
      return new WidgetType({
        name: 'FieldSelectionWidget',
        heading: 'Field Selection',
        configSchema,
        stateModel,
        ReactComponent,
      })
    })
  }

  configure(pluginManager) {
    if (pluginManager.rootModel?.appendToMenu) {
      console.log('✅ Appending widget to Help menu')

      pluginManager.rootModel.appendToMenu('Help', {
        label: 'Reopen Field Selection Widget',
        onClick: session => {
          const existing = session.widgets?.get('fieldSelection')
          if (!existing) {
            console.log('🆕 Creating FieldSelectionWidget')
            session.addWidget('FieldSelectionWidget', 'fieldSelection', {
              id: 'fieldSelection',
              type: 'FieldSelectionWidget',
            })
          } else {
            console.log('🔁 Widget already exists')
          }

          session.showWidget('fieldSelection')
        },
      })
    }
  }
}
