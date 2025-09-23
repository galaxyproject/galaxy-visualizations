declare module "*.yml" {
    const value: any;
    export default value;
}

declare module "*.yaml" {
    const value: any;
    export default value;
}

declare module "galaxy-charts" {
    export const GalaxyApi: any;
}
