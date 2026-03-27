import React from "react";
import { observer } from "mobx-react";

const FieldSelectionWidget = observer(({ model }) => {
  console.log("✅ FieldSelectionWidget rendered", model);

  return (
    <div style={{ padding: 16 }}>
      <h3>🧬 Field Selection Widget</h3>
      <p>ID: {model.id}</p>
    </div>
  );
});

export default FieldSelectionWidget;
