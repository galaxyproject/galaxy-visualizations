import { readFileSync } from "fs";
import YAML from "yaml";

export default function () {
    return {
        name: "vite-yaml",
        transform(src, id) {
            if (id.endsWith(".yml") || id.endsWith(".yaml")) {
                const parsed = YAML.parse(readFileSync(id, "utf8"));
                return {
                    code: `export default ${JSON.stringify(parsed)}`,
                    map: null,
                };
            }
        },
    };
}
