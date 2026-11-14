declare module "*.vue" {
    import type { DefineComponent } from "vue";
    const component: DefineComponent<object, object, unknown>;
    export default component;
}

declare module "@/session.js";
declare module "@/galaxy.js";
declare module "@/defaults.js";
