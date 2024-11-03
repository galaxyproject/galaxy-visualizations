import { createApp, h } from "vue";
import "./style.css";
import App from "./App.vue";

const config = {
    credentials: process.env.credentials,
    dataset_id: "MY_DATASET_ID",
    dataset_url: "pa-voting-precincts.txt",
    settings: {},
};

const xml = "openlayers.xml";

createApp({
    render: () => h(App, { config: config, xml: xml }),
}).mount("#app");
