import { useState, useEffect } from "react"
import { createViewState, JBrowseApp } from "@jbrowse/react-app"
import { createRoot, hydrateRoot } from "react-dom/client"
import "@fontsource/roboto"

import FieldSelectionPlugin from "./plugins/FieldSelectionPlugin"

export default function JBrowseWrapper(props) {
  const [viewState, setViewState] = useState()

  useEffect(() => {
    console.log("🧪 FieldSelectionPlugin class:", FieldSelectionPlugin)

    const state = createViewState({
      config: { ...props.config },
      createRootFn: createRoot,
      hydrateFn: hydrateRoot,
      configuration: {
        rpc: {
          defaultDriver: "WebWorkerRpcDriver",
        },
      },
      makeWorkerInstance: () =>
        new Worker(new URL("./rpcWorker", import.meta.url), {
          type: "module",
        }),
      plugins: [FieldSelectionPlugin],
    })

    setViewState(state)

    setTimeout(() => {
      console.log("🧩 Loaded plugins:")
      for (const plugin of state.pluginManager.plugins) {
        console.log("– – –", plugin.name)
      }

      const widgetTypes = state.pluginManager.widgetTypes
      if (widgetTypes?.registeredTypes?.FieldSelectionWidget) {
        console.log("🚀 Opening FieldSelectionWidget...")

        state.session.addWidget("FieldSelectionWidget", "fieldSelection", {
          id: "fieldSelection",
          type: "FieldSelectionWidget", // ✅ required
        })
        state.session.showWidget("fieldSelection")
      } else {
        console.warn("⛔ FieldSelectionWidget not found in registeredTypes.")
      }
    }, 300)
  }, [])

  if (!viewState) return null

  return <JBrowseApp viewState={viewState} />
}
