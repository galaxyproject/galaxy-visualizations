import "./style.css";
import { WebViewer } from "@rerun-io/web-viewer";

const rrd = new URLSearchParams(location.search).get("url") || "motion.rrd";
const viewer = new WebViewer();
viewer.start(rrd, null, {
    width: "100%",
    height: "100%",
});
